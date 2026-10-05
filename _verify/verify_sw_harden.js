/* SW 加固专项验证（node 直跑，无需浏览器）
   a) 导航 network-first：损坏缓存存在时，navigate 请求仍取网络正确内容；网络挂时回退 index.html
   b) install 容错：单个资源 cache.add reject 不阻塞 install，skipWaiting 仍被调用
   c) app.js controllerchange 防循环：两次派发，只 reload 一次 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = 'D:/学习/体系文件/统一学习平台';
const swSource = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const appSource = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

/* 构造一个 SW 全局环境并 eval sw.js
   opts.fetchImpl(url, req): 注入的 fetch
   opts.matchImpl(req): caches.match 行为，返回 response/undefined 的 Promise
   opts.addImpl(url): cache.add 行为，返回 Promise（reject 模拟 404） */
function loadSW(opts) {
  const listeners = {};
  const calls = { skipWaiting: 0, clientsClaim: 0, puts: [] };
  const cacheObj = {
    add: (u) => opts.addImpl ? opts.addImpl(u) : Promise.resolve(),
    put: (req, res) => { calls.puts.push({ req: req && (req.url || req), res }); return Promise.resolve(); },
  };
  const cachesMock = {
    open: () => Promise.resolve(cacheObj),
    match: (req) => opts.matchImpl ? opts.matchImpl(req) : Promise.resolve(undefined),
    keys: () => Promise.resolve(opts.keysImpl ? opts.keysImpl() : []),
    delete: () => Promise.resolve(true),
  };
  const selfMock = {
    addEventListener: (type, cb) => { listeners[type] = cb; },
    skipWaiting: () => { calls.skipWaiting++; return Promise.resolve(); },
    clients: { claim: () => { calls.clientsClaim++; return Promise.resolve(); } },
  };
  const sandbox = {
    self: selfMock,
    caches: cachesMock,
    fetch: (req) => opts.fetchImpl(req),
    console: console,
  };
  vm.createContext(sandbox);
  vm.runInContext(swSource + ';this.__CN=CACHE_NAME;this.__CV=CACHE_VERSION;', sandbox);
  return { listeners, calls, cachesMock, cacheObj, CN: sandbox.__CN, CV: sandbox.__CV };
}

function navEvent(req) {
  const ev = { request: req, captured: null };
  ev.respondWith = function (p) { ev.captured = p; };
  return ev;
}
function waitEvent() {
  const ev = { p: null };
  ev.waitUntil = function (p) { ev.p = p; };
  return ev;
}
// 构造一个最小 Response 桩
function res(body, ok) {
  return {
    body: body, ok: ok !== false, status: ok === false ? 500 : 200, type: 'basic',
    clone: function () { return res(body, ok !== false); },
  };
}

(async function () {
  /* ---------- a) 导航 network-first ---------- */
  console.log('== a. 导航 network-first ==');
  const CORRUPT = res('<html><body>404 Not Found 无关站点</body></html>', false);
  const GOOD = res('<html><body>统一学习平台 正常首页</body></html>', true);

  // a1: 缓存里是损坏 HTML，网络返回正确内容 → 必须返回网络内容
  {
    const sw = loadSW({
      matchImpl: (req) => Promise.resolve(CORRUPT),           // caches.match 一律返回损坏假 HTML
      fetchImpl: (req) => Promise.resolve(GOOD),
    });
    ok('CACHE_NAME = wind-learning-unified-v11', sw.CN === 'wind-learning-unified-v11', '实际 ' + sw.CN);
    ok('CACHE_VERSION = unified-v11', sw.CV === 'unified-v11', '实际 ' + sw.CV);

    const ev = navEvent({ method: 'GET', mode: 'navigate', headers: { accept: 'text/html' } });
    sw.listeners['fetch'](ev);
    ok('navigate 请求调用了 respondWith', !!ev.captured);
    const out = await ev.captured;
    ok('网络成功时返回网络正确内容（而非损坏缓存）', out === GOOD || (out && out.body === GOOD.body),
      '实际 body=' + (out && out.body));
    ok('成功导航响应被写入缓存（缓存自愈）', sw.calls.puts.length === 1, 'put 次数=' + sw.calls.puts.length);
    ok('写入缓存的是正确内容', sw.calls.puts.length === 1 && sw.calls.puts[0].res.body === GOOD.body);
  }

  // a2: 网络 reject → 回退 caches.match('./index.html')
  {
    const FALLBACK = res('<html><body>离线回退 index.html</body></html>', true);
    const sw = loadSW({
      matchImpl: (req) => {
        const k = (req && (req.url || req)) || req;
        if (k === './index.html' || (typeof k === 'string' && k.indexOf('index.html') !== -1)) return Promise.resolve(FALLBACK);
        return Promise.resolve(CORRUPT);
      },
      fetchImpl: (req) => Promise.reject(new Error('network down')),
    });
    const ev = navEvent({ method: 'GET', mode: 'navigate', headers: { accept: 'text/html' } });
    sw.listeners['fetch'](ev);
    const out = await ev.captured;
    ok('网络失败时回退到 caches.match(\'./index.html\')', out === FALLBACK || (out && out.body === FALLBACK.body),
      '实际 body=' + (out && out.body));
  }

  // a3: 非导航静态资源仍 cache-first（命中缓存即返回，不碰网络）
  {
    let fetchCalls = 0;
    const STATIC = res('body{color:red}', true);
    const sw = loadSW({
      matchImpl: (req) => Promise.resolve(STATIC),
      fetchImpl: (req) => { fetchCalls++; return Promise.resolve(res('fresh', true)); },
    });
    const ev = navEvent({ method: 'GET', mode: 'cors', url: './style.css', headers: { accept: '*/*' } });
    sw.listeners['fetch'](ev);
    const out = await ev.captured;
    ok('静态资源保持 cache-first（命中缓存即返回）', out === STATIC && fetchCalls === 0, 'fetch调用=' + fetchCalls);
  }

  /* ---------- b) install 容错 ---------- */
  console.log('== b. install 容错 ==');
  {
    const BAD_URL = './icon-512.png'; // ASSETS 中真实存在的一项，模拟其下载 404
    let badCalled = 0, goodCalled = 0;
    const sw = loadSW({
      addImpl: (u) => {
        if (u === BAD_URL) { badCalled++; return Promise.reject(new Error('404')); }
        goodCalled++; return Promise.resolve();
      },
    });
    const ev = waitEvent();
    sw.listeners['install'](ev);
    let settled = 'pending';
    await ev.p.then(() => { settled = 'resolved'; }, (e) => { settled = 'rejected: ' + e; });
    ok('install 的 waitUntil 在单个资源 404 时仍 resolve（不阻塞）', settled === 'resolved', '实际 ' + settled);
    ok('损坏资源被尝试安装并被吞掉', badCalled === 1, 'badCalled=' + badCalled);
    ok('其余资源正常安装', goodCalled > 0, 'goodCalled=' + goodCalled);
    ok('self.skipWaiting 仍被调用', sw.calls.skipWaiting === 1, 'skipWaiting=' + sw.calls.skipWaiting);
  }

  /* ---------- c) controllerchange 防循环（定向执行 app.js 注册块） ---------- */
  console.log('== c. controllerchange 防循环 ==');
  {
    // 从 app.js 中精确抽取 SW 注册块（首个 { 起做花括号配平）
    const marker = "if ('serviceWorker' in navigator";
    const startIdx = appSource.indexOf(marker);
    ok('app.js 中找到 SW 注册块', startIdx !== -1);
    let i = appSource.indexOf('{', startIdx);
    let depth = 0, end = -1;
    for (; i < appSource.length; i++) {
      if (appSource[i] === '{') depth++;
      else if (appSource[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const block = appSource.slice(startIdx, end + 1);

    const swListeners = {};
    let loadHandler = null;
    const reloads = [];
    const sessionStore = {};
    const ctx = {
      navigator: { serviceWorker: {
        addEventListener: (type, cb) => { swListeners[type] = cb; },
        register: () => ({ catch: () => {} }),
      }},
      window: { addEventListener: (ev, cb) => { if (ev === 'load') loadHandler = cb; } },
      sessionStorage: {
        getItem: (k) => (k in sessionStore ? sessionStore[k] : null),
        setItem: (k, v) => { sessionStore[k] = String(v); },
      },
      location: { reload: () => { reloads.push(1); } },
    };
    vm.createContext(ctx);
    vm.runInContext(block, ctx);

    ok('注册块挂载了 controllerchange 监听', typeof swListeners.controllerchange === 'function');
    ok('load 时仍会 register（注册逻辑保持原样）', typeof loadHandler === 'function');

    // 第一次派发 → reload 一次并写标志
    swListeners.controllerchange();
    ok('第一次 controllerchange 触发 location.reload()', reloads.length === 1, 'reloads=' + reloads.length);
    ok('同时写入 sessionStorage.sw_reloaded=1', sessionStore.sw_reloaded === '1', '实际 ' + sessionStore.sw_reloaded);

    // 第二次派发 → 标志位存在，不再 reload
    swListeners.controllerchange();
    ok('第二次 controllerchange 不再 reload（防循环）', reloads.length === 1, 'reloads=' + reloads.length);
  }

  console.log('');
  console.log('SW 加固专项结果：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('脚本异常：', e); process.exit(2); });
