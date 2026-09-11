/* 自测：kbLookup 系列号展开 / 年份变体 / 自引用 修复
   用法: node _verify/test_kb_lookup.js
   通过 jsdom 加载真实 index.html + app.js，注册登录后进入课程，
   用合成 .std-link 触发 openKb，读取 #kbBody 验证命中结果。 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = 'D:/学习/体系文件/统一学习平台';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async function () {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    url: 'http://127.0.0.1:8765/index.html',
    pretendToBeVisual: true
  });
  const w = dom.window;
  const d = w.document;
  w.alert = function () {};
  w.confirm = function () { return true; };
  w.scrollTo = function () {};
  w.URL.createObjectURL = function () { return 'blob:mock'; };
  w.URL.revokeObjectURL = function () {};

  const $ = id => d.getElementById(id);
  const fire = (el, ev) => { el.dispatchEvent(new w.Event(ev, { bubbles: true, cancelable: true })); };
  await sleep(600);

  // 注册并登录
  $('tabReg').click();
  $('rgUser').value = 'kbtest';
  $('rgNick').value = 'KB测试';
  $('rgPass').value = '1234';
  $('rgPass2').value = '1234';
  fire($('formReg'), 'submit');
  await sleep(300);

  const cards = d.querySelectorAll('.portal-card');
  // cards[0]=gbt46154, [1]=nbt11773, [2]=nbt10991
  async function enterCourse(idx) {
    if ($('view-portal').classList.contains('hidden')) {
      $('btnBackPortal').click();
      await sleep(300);
    }
    d.querySelectorAll('.portal-card')[idx].querySelector('.pc-btn').click();
    await sleep(800);
  }

  // 触发 openKb 并返回 kbBody 文本
  async function probe(stdText) {
    const a = d.createElement('a');
    a.className = 'std-link';
    a.setAttribute('data-kb', stdText);
    a.textContent = stdText;
    d.body.appendChild(a);
    a.click();
    await sleep(100);
    const bodyHtml = $('kbBody').innerHTML;
    const bodyText = $('kbBody').textContent;
    // 关闭弹窗
    $('kbClose').click();
    await sleep(50);
    d.body.removeChild(a);
    return { html: bodyHtml, text: bodyText };
  }

  console.log('== A. gbt46154 课程 ==');
  await enterCourse(0);

  // 1. 合并系列键：GB/T 3480.1 -> GB/T 3480.1/.2/.3/.5
  let r = await probe('GB/T 3480.1');
  ok('系列号 GB/T 3480.1 命中合并系列键',
     r.html.indexOf('GB/T 3480.1/.2/.3/.5') !== -1,
     'body=' + r.text.slice(0, 80));

  // 2. 合并系列键子号：GB/T 16273.4 -> GB/T 16273.1/.4
  r = await probe('GB/T 16273.4');
  ok('系列号 GB/T 16273.4 命中合并系列键',
     r.html.indexOf('GB/T 16273.1/.4') !== -1,
     'body=' + r.text.slice(0, 80));

  // 3. 年份变体：正文带年份 -> 键不带年份 GB/T 23821
  r = await probe('GB/T 23821—2022');
  ok('年份变体 GB/T 23821—2022 命中无年份键',
     /GB\/T\s*23821/.test(r.text) && r.html.indexOf('未收录') === -1,
     'body=' + r.text.slice(0, 80));

  // 4. 自引用：GB/T 46154—2025 是本课程标准
  r = await probe('GB/T 46154—2025');
  ok('自引用 GB/T 46154—2025 显示本课程标准',
     r.text.indexOf('本课程标准') !== -1 && r.html.indexOf('未收录') === -1,
     'body=' + r.text.slice(0, 120));

  // 5. 自引用无年份：GB/T 46154
  r = await probe('GB/T 46154');
  ok('自引用 GB/T 46154（无年份）显示本课程标准',
     r.text.indexOf('本课程标准') !== -1,
     'body=' + r.text.slice(0, 120));

  console.log('== B. nbt11773 课程 ==');
  await enterCourse(1);

  // 6. 所有部分：GB/T 3880 -> GB/T 3880（所有部分）
  r = await probe('GB/T 3880');
  ok('所有部分 GB/T 3880 命中（所有部分）键',
     r.html.indexOf('GB/T 3880（所有部分）') !== -1,
     'body=' + r.text.slice(0, 80));

  // 7. 所有部分子号：GB/T 3880.2 -> GB/T 3880（所有部分）
  r = await probe('GB/T 3880.2');
  ok('所有部分子号 GB/T 3880.2 命中（所有部分）键',
     r.html.indexOf('GB/T 3880（所有部分）') !== -1,
     'body=' + r.text.slice(0, 80));

  // 8. 所有部分子号：GB/T 17888.1 -> GB/T 17888（所有部分）
  r = await probe('GB/T 17888.1');
  ok('所有部分子号 GB/T 17888.1 命中（所有部分）键',
     r.html.indexOf('GB/T 17888（所有部分）') !== -1,
     'body=' + r.text.slice(0, 80));

  // 9. 年份变体反向：GB/T 709（无年份）键就是无年份，直接命中
  r = await probe('GB/T 709—2019');
  ok('年份变体 GB/T 709—2019 命中无年份键 GB/T 709',
     r.text.indexOf('GB/T 709') !== -1 && r.html.indexOf('未收录') === -1,
     'body=' + r.text.slice(0, 80));

  // 10. 自引用 NB/T 11773—2025
  r = await probe('NB/T 11773—2025');
  ok('自引用 NB/T 11773—2025 显示本课程标准',
     r.text.indexOf('本课程标准') !== -1,
     'body=' + r.text.slice(0, 120));

  console.log('== C. nbt10991 课程 ==');
  await enterCourse(2);

  // 11. 年份变体反向：正文无年份 GB/T 19155 -> 键带年份 GB/T19155—2017
  r = await probe('GB/T 19155');
  ok('年份变体 GB/T 19155 命中带年份键 GB/T19155—2017',
     r.html.indexOf('GB/T19155—2017') !== -1 || /GB\/T\s*19155/.test(r.text),
     'body=' + r.text.slice(0, 80));

  // 12. 自引用 NB/T 10991—2022
  r = await probe('NB/T 10991—2022');
  ok('自引用 NB/T 10991—2022 显示本课程标准',
     r.text.indexOf('本课程标准') !== -1,
     'body=' + r.text.slice(0, 120));

  console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
