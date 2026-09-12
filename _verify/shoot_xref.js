/* 出处弹窗交叉引用 · 真浏览器截图
   (a) gbt46154 出处弹窗中"见5.2.3.2.3"显示为可点击链接
   (b) 点击后弹窗内展开目标条款内容
   (c) nbt10991 附录A 引用点击命中附录条目
   用法: node _verify/shoot_xref.js
*/
'use strict';
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'http://127.0.0.1:8765/index.html';
const OUT = 'D:/学习/体系文件/统一学习平台/_verify/screenshots';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('dialog', async d => { await d.accept(); });

  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(500);

  // 注册登录
  await page.click('#tabReg');
  await page.type('#rgUser', 'xshot');
  await page.type('#rgNick', '截');
  await page.type('#rgPass', '1234');
  await page.type('#rgPass2', '1234');
  await page.evaluate(() => document.getElementById('formReg').dispatchEvent(new Event('submit', { bubbles: true })));
  await sleep(500);

  // 进入 gbt46154（卡片0）
  const cards = await page.$$('.portal-card');
  await cards[0].$eval('.pc-btn', el => el.click());
  await sleep(1200);

  // (a) 打开 C.3.4.1（正文含"(见5. 2.3.2.3)"），截图弹窗
  await page.evaluate(() => {
    const a = document.createElement('a');
    a.className = 'src-link';
    a.setAttribute('data-kb', 'C.3.4.1');
    a.textContent = 'C.3.4.1';
    a.id = 'synth-src';
    document.body.appendChild(a);
    a.click();
  });
  await sleep(300);
  let kbModal = await page.$('#kbModal');
  await kbModal.screenshot({ path: path.join(OUT, 'xref_a_gbt46154_clickable_link.png') });
  console.log('  (a) xref_a_gbt46154_clickable_link.png');

  // (b) 点击弹窗内第一个 .xref-link，截图展开后的目标条款
  await page.evaluate(() => {
    const x = document.querySelector('#kbBody .xref-link');
    if (x) x.click();
  });
  await sleep(300);
  // 滚动到底部以展示追加内容
  await page.evaluate(() => {
    const b = document.querySelector('.kb-body');
    if (b) b.scrollTop = b.scrollHeight;
  });
  await sleep(300);
  kbModal = await page.$('#kbModal');
  await kbModal.screenshot({ path: path.join(OUT, 'xref_b_gbt46154_target_expanded.png') });
  console.log('  (b) xref_b_gbt46154_target_expanded.png');

  // 关闭弹窗，回门户，进入 nbt10991（卡片2）
  await page.evaluate(() => document.getElementById('kbClose').click());
  await sleep(200);
  await page.evaluate(() => {
    const s = document.getElementById('synth-src'); if (s) s.remove();
  });
  await page.click('#btnBackPortal');
  await sleep(400);
  const cards2 = await page.$$('.portal-card');
  await cards2[2].$eval('.pc-btn', el => el.click());
  await sleep(1200);

  // (c) 打开 5.4.5.1（正文含"见附录A"），点击"附录A"链接，截图附录条目
  await page.evaluate(() => {
    const a = document.createElement('a');
    a.className = 'src-link';
    a.setAttribute('data-kb', '5.4.5.1');
    a.textContent = '5.4.5.1';
    a.id = 'synth-src2';
    document.body.appendChild(a);
    a.click();
  });
  await sleep(300);
  await page.evaluate(() => {
    // 点击文本为"附录A"的 .xref-link
    const links = document.querySelectorAll('#kbBody .xref-link');
    for (const l of links) {
      if (l.textContent.indexOf('附录A') !== -1) { l.click(); break; }
    }
  });
  await sleep(300);
  await page.evaluate(() => {
    const b = document.querySelector('.kb-body');
    if (b) b.scrollTop = b.scrollHeight;
  });
  await sleep(300);
  kbModal = await page.$('#kbModal');
  await kbModal.screenshot({ path: path.join(OUT, 'xref_c_nbt10991_appendixA.png') });
  console.log('  (c) xref_c_nbt10991_appendixA.png');

  await browser.close();
  console.log('\n截图完成，保存在: ' + OUT);
})();
