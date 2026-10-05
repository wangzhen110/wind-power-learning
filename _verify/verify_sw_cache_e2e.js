/* SW 缓存损坏中间态 · 真浏览器 E2E（puppeteer-core + 真 Edge）
   场景：向 v11 缓存中 index.html 写入一段损坏假 HTML，随后 reload，
   断言导航 network-first 仍从网络取正确页面，课程题量仍 330，且不会无限刷新。 */
'use strict';
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = 'http://127.0.0.1:8765';
const URL = BASE + '/index.html';
const V11 = 'wind-learning-unified-v11';
const V10 = 'wind-learning-unified-v10';
const CORRUPT_MARK = '404 Not Found 无关站点';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-e2e-'));
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new', userDataDir,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  page.on('dialog', async d => { await d.accept(); });

  const navs = [];
  page.on('framenavigated', f => { if (f === page.mainFrame()) navs.push(f.url()); });

  try {
    console.log('== 1. 首次打开（v11 首次激活会自动 reload 一次） ==');
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });

    // 等待 SW 激活并完成那次 controllerchange 自动 reload（sw_reloaded 写入 + controller 存在）
    await page.waitForFunction(
      () => navigator.serviceWorker && navigator.serviceWorker.controller &&
            sessionStorage.getItem('sw_reloaded') === '1',
      { timeout: 25000 }
    );
    ok('v11 SW 已激活且触发过一次自动 reload（sw_reloaded=1）', true);

    // 防循环：停留 4 秒，确认不会第二次导航
    const navCountBefore = navs.length;
    await sleep(4000);
    const navCountAfter = navs.length;
    ok('激活后停留 4s 无第二次导航（不无限刷新）', navCountBefore === navCountAfter,
      'navs=' + JSON.stringify(navs));

    const swState = await page.evaluate(() => ({
      controller: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
      scriptURL: navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : null,
    }));
    ok('navigator.serviceWorker.controller 存在', swState.controller);
    ok('controller.scriptURL 指向 sw.js', !!swState.scriptURL && /sw\.js$/.test(swState.scriptURL), swState.scriptURL);

    console.log('== 2. 注册测试账号并进入课程（损坏前基线，题量 330） ==');
    const uname = 'swhard' + Date.now();
    await page.evaluate(() => { document.getElementById('tabReg').click(); });
    await page.type('#rgUser', uname);
    await page.type('#rgNick', 'SW测试');
    await page.type('#rgPass', 'test123');
    await page.type('#rgPass2', 'test123');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {}),
      page.click('#formReg .auth-btn'),
    ]);
    await page.waitForSelector('.portal-card', { timeout: 10000 });
    ok('注册后进入门户', await page.evaluate(() => !document.getElementById('view-portal').classList.contains('hidden')));

    await page.evaluate(() => document.querySelectorAll('.portal-card')[0].querySelector('.pc-btn').click());
    await page.waitForFunction(() => document.getElementById('lecTitle').textContent !== '正在加载课程数据…', { timeout: 20000 });
    const baselineTotal = await page.evaluate(() => document.getElementById('totalCount').textContent);
    ok('损坏前课程题量 = 330', baselineTotal === '330', '实际 ' + baselineTotal);

    console.log('== 3. 向 v11 缓存注入损坏的 index.html ==');
    await page.evaluate(async (v11, mark) => {
      const cache = await caches.open(v11);
      const url = new URL('./index.html', location.href).href;
      await cache.put(url, new Response('<html><body>' + mark + '</body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
    }, V11, CORRUPT_MARK);
    ok('已向 ' + V11 + ' 写入损坏 index.html', true);

    console.log('== 4. reload 后断言页面仍正常（network-first 绕过损坏缓存） ==');
    await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
    await sleep(800);
    const afterReload = await page.evaluate((mark) => ({
      title: document.title,
      text: document.body.innerText,
      hasCorrupt: document.body.innerHTML.indexOf(mark) !== -1,
      swReloaded: sessionStorage.getItem('sw_reloaded'),
    }), CORRUPT_MARK);
    ok('reload 后页面文本不含损坏标记', afterReload.hasCorrupt === false, afterReload.text.slice(0, 80));
    ok('reload 后渲染的是本应用真实页面（登录/门户/课程）',
      /统一登录/.test(afterReload.title) || /统一登录/.test(afterReload.text) ||
      /课程|门户|我的课程|题库/.test(afterReload.text),
      afterReload.title + ' | ' + afterReload.text.slice(0, 60));

    // 重新进入课程（若已登录态保留则直接进；否则登录）
    async function ensureCourse() {
      const portalVisible = await page.evaluate(() => !document.getElementById('view-portal').classList.contains('hidden'));
      if (!portalVisible) {
        // 可能回到了登录页，登录
        await page.type('#liUser', uname);
        await page.type('#liPass', 'test123');
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {}),
          page.click('#formLogin .auth-btn'),
        ]);
        await page.waitForSelector('.portal-card', { timeout: 10000 });
      }
      const courseVisible = await page.evaluate(() => !document.getElementById('view-course').classList.contains('hidden'));
      if (!courseVisible) {
        await page.evaluate(() => document.querySelectorAll('.portal-card')[0].querySelector('.pc-btn').click());
      }
      await page.waitForFunction(() => document.getElementById('lecTitle').textContent !== '正在加载课程数据…', { timeout: 20000 });
      return page.evaluate(() => document.getElementById('totalCount').textContent);
    }

    const afterTotal = await ensureCourse();
    ok('损坏缓存后重新进入课程题量仍 = 330', afterTotal === '330', '实际 ' + afterTotal);
    const stillClean = await page.evaluate((mark) => document.body.innerHTML.indexOf(mark) === -1, CORRUPT_MARK);
    ok('课程页面文本仍不含损坏标记', stillClean);

    console.log('== 5. 缓存版本佐证（v11 存在、v10 已清除） ==');
    const cachesInfo = await page.evaluate(async (v11, v10) => {
      const keys = await caches.keys();
      return { hasV11: keys.indexOf(v11) !== -1, hasV10: keys.indexOf(v10) !== -1, keys: keys };
    }, V11, V10);
    ok('v11 缓存存在', cachesInfo.hasV11, JSON.stringify(cachesInfo.keys));
    ok('旧 v10 缓存已被删除', cachesInfo.hasV10 === false, JSON.stringify(cachesInfo.keys));
    const ctrl2 = await page.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
    ok('课程页仍由 SW 控制', ctrl2);

    console.log('== 6. 最终防循环复核 ==');
    const n0 = navs.length;
    await sleep(3000);
    const n1 = navs.length;
    ok('收尾停留 3s 无额外导航', n0 === n1, 'navs 总数=' + navs.length);

    console.log('  [导航日志] ' + JSON.stringify(navs));
  } catch (e) {
    fail++;
    console.error('E2E 异常：', e);
  } finally {
    await browser.close();
  }

  console.log('');
  console.log('SW 缓存损坏 E2E 结果：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('脚本顶层异常：', e); process.exit(2); });
