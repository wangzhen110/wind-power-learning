/* 图片专项验证：文件存在/非空 + kb.image 引用 + 题目 figs 引用 + HTTP 200 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = 'D:/学习/体系文件/统一学习平台';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function loadKB(p) {
  const raw = fs.readFileSync(p, 'utf8');
  const lines = raw.split('\n');
  let al = null;
  for (const ln of lines) if (/^\s*window\.KB\s*=/.test(ln)) { al = ln; break; }
  let body = al.replace(/^\s*window\.KB\s*=\s*/, '').trim();
  if (body.endsWith(';')) body = body.slice(0, -1);
  return JSON.parse(body);
}
global.window = {};
function loadJS(p) { (0, eval)(fs.readFileSync(p, 'utf8') + '\n//# sourceURL=' + p); }

const courses = ['gbt46154', 'nbt11773', 'nbt10991'];

console.log('== 1. images/ 目录文件存在且非空 ==');
const expected = {
  gbt46154: ['fig_cover','fig_1','fig_2','fig_3','fig_4','fig_5','fig_6','fig_7','fig_8','fig_9','fig_10','fig_B1','fig_B2','fig_E1','fig_E2'].map(f => f + '.png'),
  nbt11773: ['fig_1','fig_2','fig_3','fig_4','fig_5','fig_6'].map(f => f + '.png'),
  nbt10991: ['appendix_A.jpg']
};
for (const c of courses) {
  const dir = path.join(ROOT, 'data', c, 'images');
  for (const f of expected[c]) {
    const fp = path.join(dir, f);
    const exists = fs.existsSync(fp);
    const size = exists ? fs.statSync(fp).size : 0;
    ok(c + '/' + f + ' 存在且非空', exists && size > 0, 'size=' + size);
  }
}

console.log('\n== 2. kb.js special 图条目 image 字段引用文件存在 ==');
for (const c of courses) {
  const KB = loadKB(path.join(ROOT, 'data', c, 'kb.js'));
  for (const k of Object.keys(KB.special)) {
    const entry = KB.special[k];
    if (entry.image) {
      const fp = path.join(ROOT, 'data', c, entry.image);
      ok(c + ' special[' + k + '].image=' + entry.image, fs.existsSync(fp) && fs.statSync(fp).size > 0);
    }
  }
}

console.log('\n== 3. 题目 figs 字段引用文件存在 ==');
// choice questions
for (const c of courses) {
  const n = c === 'gbt46154' ? 14 : (c === 'nbt11773' ? 9 : 14);
  for (let i = 1; i <= n; i++) {
    const k = 'CH' + (i < 10 ? '0' + i : i);
    loadJS(path.join(ROOT, 'data', c, 'ch' + (i < 10 ? '0' + i : i) + '.js'));
    const ch = global.window[k];
    if (!ch || !ch.questions) continue;
    ch.questions.forEach((q, qi) => {
      if (q.figs && q.figs.length) {
        q.figs.forEach(fn => {
          const fp = path.join(ROOT, 'data', c, 'images', fn);
          ok(c + ' ch' + (i < 10 ? '0' + i : i) + '#' + qi + ' figs:' + fn, fs.existsSync(fp) && fs.statSync(fp).size > 0);
        });
      }
    });
  }
  // fill.js
  loadJS(path.join(ROOT, 'data', c, 'fill.js'));
  if (global.window.FILL && global.window.FILL.questions) {
    global.window.FILL.questions.forEach((q, qi) => {
      if (q.figs && q.figs.length) {
        q.figs.forEach(fn => {
          const fp = path.join(ROOT, 'data', c, 'images', fn);
          ok(c + ' fill#' + qi + ' figs:' + fn, fs.existsSync(fp) && fs.statSync(fp).size > 0);
        });
      }
    });
  }
  global.window = {};
}

console.log('\n== 4. 本地静态服务图片 URL 返回 200 ==');
const http = require('http');
function get(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => { resolve({ status: res.statusCode, type: res.headers['content-type'] }); res.resume(); })
      .on('error', (e) => resolve({ status: 0, err: e.message }));
  });
}
(async () => {
  const urls = [
    'http://127.0.0.1:8765/data/gbt46154/images/fig_1.png',
    'http://127.0.0.1:8765/data/gbt46154/images/fig_B2.png',
    'http://127.0.0.1:8765/data/nbt11773/images/fig_3.png',
    'http://127.0.0.1:8765/data/nbt10991/images/appendix_A.jpg'
  ];
  for (const u of urls) {
    const r = await get(u);
    ok(u.replace('http://127.0.0.1:8765', ''), r.status === 200, 'status=' + r.status + ' type=' + r.type);
  }
  console.log('\n图片专项结果：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})();
