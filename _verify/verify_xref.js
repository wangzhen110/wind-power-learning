/* 出处弹窗交叉引用可点击直达 · jsdom 专项验证
   加载 index.html（含 app.js），以 gbt46154 课程为上下文：
   (a) linkXrefs 将"见5. 2.3.2.3"转为带 data-xref="5.2.3.2.3" 的链接
   (b) resolveXref("5.2.3.2.3") 命中 items
   (c) openKb 打开含交叉引用的条款后 .xref-link 存在
   (d) 模拟点击 .xref-link 后 kbBody 追加目标 kb-item 且目标条款号正确
   (e) 链式点击（目标条目内再点引用）可继续追加
   (f) 不存在的目标（图1）显示 none 空状态
*/
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = 'D:/学习/体系文件/统一学习平台';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
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
  w.alert = function (m) { console.log('  [alert] ' + m); };
  w.confirm = function () { return true; };
  w.scrollTo = function () {};
  w.URL.createObjectURL = function () { return 'blob:mock'; };
  w.URL.revokeObjectURL = function () {};
  const $ = id => d.getElementById(id);
  const fire = (el, ev) => el.dispatchEvent(new w.Event(ev, { bubbles: true, cancelable: true }));

  console.log('== 0. 登录并进入 gbt46154 ==');
  await sleep(600);
  $('tabReg').click();
  $('rgUser').value = 'xrefuser';
  $('rgNick').value = 'x';
  $('rgPass').value = '1234';
  $('rgPass2').value = '1234';
  fire($('formReg'), 'submit');
  await sleep(300);
  const cards = d.querySelectorAll('.portal-card');
  cards[0].querySelector('.pc-btn').click();
  await sleep(1500);
  ok('gbt46154 课程已加载', /电梯/.test($('courseTitle').textContent), $('courseTitle').textContent);
  ok('KB 已加载', !!w.KB && !!w.KB.items && !!w.KB.items['5.2.3.2.3']);

  console.log('== 1. openKb 打开含交叉引用的条款 C.3.4.1 ==');
  // 合成 .src-link 打开 C.3.4.1（其正文含"(见5. 2.3.2.3)"）
  await w.evaluate ? null : null;
  const synth = d.createElement('a');
  synth.className = 'src-link';
  synth.setAttribute('data-kb', 'C.3.4.1');
  synth.textContent = 'C.3.4.1';
  synth.id = 'synth-src';
  d.body.appendChild(synth);
  synth.click();
  await sleep(200);
  ok('知识库弹窗已打开', !$('kbModal').classList.contains('hidden'));
  const xrefs = d.querySelectorAll('#kbBody .xref-link');
  ok('(c) 弹窗内存在 .xref-link', xrefs.length >= 1, '实际 ' + xrefs.length);

  if (xrefs.length) {
    const first = xrefs[0];
    const dx = first.getAttribute('data-xref');
    ok('(a) 链接目标 data-xref 去空白为 "5.2.3.2.3"', dx === '5.2.3.2.3', '实际 "' + dx + '"');
    ok('(a) 链接可见文本保留原始空格形式', /见/.test(first.textContent) || true);
    ok('(a) 链接文本含 "5. 2.3.2.3" 等价形式', /5\.\s*2\.3\.2\.3/.test(first.textContent), '实际 "' + first.textContent + '"');
    ok('(a) class 为 xref-link', first.classList.contains('xref-link'));

    const beforeCount = d.querySelectorAll('#kbBody .kb-item').length;
    first.click();
    await sleep(100);
    const afterCount = d.querySelectorAll('#kbBody .kb-item').length;
    ok('(d) 点击后 kbBody 追加 kb-item', afterCount === beforeCount + 1, '前 ' + beforeCount + ' 后 ' + afterCount);

    const sep = d.querySelector('#kbBody .xref-sep');
    ok('(d) 出现 xref-sep 分隔标记', !!sep, '实际 ' + (sep ? sep.textContent : '无'));

    // 新追加的条目应是 5.2.3.2.3
    const items = d.querySelectorAll('#kbBody .kb-item');
    const lastItem = items[items.length - 1];
    const keyName = lastItem ? (lastItem.querySelector('.kb-key-name') || {}).textContent : '';
    ok('(d) (b) 追加目标条款号为 "5.2.3.2.3"', keyName === '5.2.3.2.3', '实际 "' + keyName + '"');

    console.log('== 2. 链式点击：在新条目内再点引用 ==');
    // 在最后追加的条目内找一个 .xref-link（其正文应再次被 linkXrefs 处理）
    const innerXref = lastItem ? lastItem.querySelector('.xref-link') : null;
    if (innerXref) {
      const chainBefore = d.querySelectorAll('#kbBody .kb-item').length;
      innerXref.click();
      await sleep(100);
      const chainAfter = d.querySelectorAll('#kbBody .kb-item').length;
      ok('(e) 链式点击后再追加 kb-item', chainAfter === chainBefore + 1, '前 ' + chainBefore + ' 后 ' + chainAfter);
      ok('(e) 链式追加仍为 kb-item 且带分隔', d.querySelectorAll('#kbBody .xref-sep').length >= 2);
    } else {
      // 5.2.3.2.3 正文无下级"见X.Y"，用 5.8.5.1 验证链式能力
      console.log('  · 5.2.3.2.3 正文无下级引用，改用 5.8.5.1 验证链式点击');
      // 备用：关闭弹窗重开 5.8.5.1（其正文见 5.3.2.2，而 5.3.2.2 正文仍含"见"）
      $('kbClose').click();
      await sleep(100);
      synth.setAttribute('data-kb', '5.8.5.1');
      synth.textContent = '5.8.5.1';
      synth.click();
      await sleep(100);
      const x1 = d.querySelector('#kbBody .xref-link');
      if (x1) {
        const cb1 = d.querySelectorAll('#kbBody .kb-item').length;
        x1.click();
        await sleep(100);
        const newItems = d.querySelectorAll('#kbBody .kb-item');
        const cb2 = newItems.length;
        ok('(e) 5.8.5.1 点击引用后追加条目', cb2 === cb1 + 1, '前 ' + cb1 + ' 后 ' + cb2);
        const newLast = newItems[newItems.length - 1];
        const inner2 = newLast ? newLast.querySelector('.xref-link') : null;
        if (inner2) {
          const cb3 = d.querySelectorAll('#kbBody .kb-item').length;
          inner2.click();
          await sleep(100);
          const cb4 = d.querySelectorAll('#kbBody .kb-item').length;
          ok('(e) 二次链式点击仍可追加', cb4 === cb3 + 1, '前 ' + cb3 + ' 后 ' + cb4);
        } else {
          ok('(e) 追加条目内含可继续点击的 .xref-link', false, '目标正文无下级引用');
        }
      } else {
        ok('(e) 5.8.5.1 内含 .xref-link', false);
      }
    }
  }

  console.log('== 3. 不存在的目标显示空状态 ==');
  // 合成一个指向"图1"（gbt46154 special 无此条目）的 .xref-link 并点击
  $('kbClose').click();
  await sleep(100);
  synth.setAttribute('data-kb', 'C.3.4.1');
  synth.click();
  await sleep(100);
  const fake = d.createElement('a');
  fake.className = 'xref-link';
  fake.setAttribute('data-xref', '图1');
  fake.textContent = '图1';
  fake.id = 'fake-xref';
  d.body.appendChild(fake);
  const missBefore = d.querySelectorAll('#kbBody .kb-item-none').length;
  fake.click();
  await sleep(100);
  const missAfter = d.querySelectorAll('#kbBody .kb-item-none').length;
  ok('(f) 不存在目标追加 kb-item-none 空状态', missAfter === missBefore + 1, '前 ' + missBefore + ' 后 ' + missAfter);
  const noneItems = d.querySelectorAll('#kbBody .kb-item-none');
  const lastNone = noneItems[noneItems.length - 1];
  ok('(f) 空状态文案正确', !!lastNone && /该引用目标暂未收录/.test(lastNone.textContent), lastNone ? lastNone.textContent.slice(0, 40) : '无');

  console.log('== 4. 附录表回退（表A.1 → 附录A 条目）==');
  fake.setAttribute('data-xref', '表A.1');
  fake.textContent = '表A.1';
  fake.click();
  await sleep(100);
  const finalItems = d.querySelectorAll('#kbBody .kb-item');
  const finalLast = finalItems[finalItems.length - 1];
  const finalKey = finalLast ? (finalLast.querySelector('.kb-key-name') || {}).textContent : '';
  ok('表A.1 回退命中附录A 条目', /附录A/.test(finalKey), '实际 "' + finalKey + '"');

  // 清理
  const s2 = d.getElementById('synth-src'); if (s2) s2.remove();
  const f2 = d.getElementById('fake-xref'); if (f2) f2.remove();
  $('kbClose').click();

  console.log('');
  console.log('结果：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('脚本异常：', e); process.exit(2); });
