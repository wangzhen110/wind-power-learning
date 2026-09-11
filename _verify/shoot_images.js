/* 真浏览器截图：三套课程 讲解含图 / 题目含图 / 出处弹窗图条目 */
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
    executablePath: EDGE, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('dialog', async d => { await d.accept(); });

  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(500);
  // 登录（用固定用户，已存在则直接登录）
  async function login(u, nick) {
    // 先试登录
    await page.evaluate(() => document.getElementById('tabLogin').click());
    await sleep(200);
    await page.type('#liUser', u);
    await page.type('#liPass', '1234');
    await page.evaluate(() => document.getElementById('formLogin').dispatchEvent(new Event('submit', { bubbles: true })));
    await sleep(800);
    if (!await page.evaluate(() => document.getElementById('view-portal').classList.contains('hidden'))) return;
    // 登录失败则注册
    await page.evaluate(() => document.getElementById('tabReg').click());
    await sleep(200);
    await page.type('#rgUser', u);
    await page.type('#rgNick', nick);
    await page.type('#rgPass', '1234');
    await page.type('#rgPass2', '1234');
    await page.evaluate(() => document.getElementById('formReg').dispatchEvent(new Event('submit', { bubbles: true })));
    await sleep(800);
  }
  await login('imgshot', '图截');

  // 等待课程图片加载完成
  async function waitImgs(sel) {
    await page.evaluate((sel) => {
      const imgs = Array.from(document.querySelectorAll(sel));
      return Promise.all(imgs.map(im => im.complete ? 1 : new Promise(r => { im.onload = r; im.onerror = r; })));
    }, sel);
    await sleep(300);
  }
  async function shot(name) {
    const f = path.join(OUT, name);
    await page.screenshot({ path: f });
    console.log('  截图: ' + name);
  }
  async function openCourse(cardIdx) {
    if (!await page.evaluate(() => !document.getElementById('view-portal').classList.contains('hidden'))) {
      await page.evaluate(() => document.getElementById('btnBackPortal').click());
      await sleep(500);
    }
    const cards = await page.$$('.portal-card');
    await cards[cardIdx].$eval('.pc-btn', el => el.click());
    await sleep(1200);
  }
  async function gotoSlide(chapIdx, slideIdx) {
    await page.evaluate(() => { document.getElementById('view-lecture'); });
    // 确保在讲解视图
    if (await page.evaluate(() => document.getElementById('view-lecture').classList.contains('hidden'))) {
      await page.evaluate(() => document.getElementById('lecToLecture') ? document.getElementById('lecToLecture').click() : null);
      await sleep(300);
    }
    const items = await page.$$('#chapNav .chap-item');
    await items[chapIdx].click();
    await sleep(600);
    await page.evaluate((si) => {
      const dots = document.querySelectorAll('#lecDots .dot');
      if (dots[si]) dots[si].click();
    }, slideIdx);
    await sleep(500);
    await waitImgs('#lecSlide img.slide-fig');
  }
  async function gotoQuestion(chapterId, poolIdx) {
    // 切到答题视图
    await page.evaluate(() => { document.getElementById('lecToQuiz').click(); });
    await sleep(500);
    // 过滤章节
    await page.evaluate((cid) => {
      const sel = document.getElementById('fChapter');
      sel.value = String(cid);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, chapterId);
    await sleep(500);
    // 点击 jump 按钮
    await page.evaluate((pi) => {
      const btns = document.querySelectorAll('#jumpGrid .jump-btn');
      if (btns[pi]) btns[pi].click();
    }, poolIdx);
    await sleep(500);
    await waitImgs('#qText ~ .q-fig-wrap img.q-fig');
  }
  async function openKbFig(dataKb) {
    await page.evaluate((dk) => {
      const a = document.createElement('a');
      a.className = 'std-link';
      a.dataset.kb = dk;
      a.textContent = dk;
      a.id = 'synthetic-kb';
      document.body.appendChild(a);
      a.click();
    }, dataKb);
    await sleep(400);
    await waitImgs('#kbModal img.kb-fig');
  }

  // ===== gbt46154 (card 0) =====
  console.log('== gbt46154 ==');
  await openCourse(0);
  await gotoSlide(4, 1); // ch05 (idx4) slide[1] 轿厢周围安全距离
  await shot('gbt46154_讲解_轿厢安全距离.png');
  await gotoQuestion(5, 12); // ch05 第12题(0-based)
  await shot('gbt46154_题目_层站防护装置.png');
  await openKbFig('图3、图4 标引说明');
  await shot('gbt46154_弹窗_图3图4标引说明.png');
  await page.evaluate(() => { const b=document.getElementById('kbClose'); if(b) b.click(); });
  await sleep(200);

  // ===== nbt11773 (card 1) =====
  console.log('== nbt11773 ==');
  await openCourse(1);
  await gotoSlide(3, 2); // ch04 (idx3) slide[2] 折弯成形
  await shot('nbt11773_讲解_折弯成形.png');
  await gotoQuestion(4, 17); // ch04 局部压弯题(实际idx17)
  await shot('nbt11773_题目_局部压弯.png');
  await openKbFig('图3');
  await shot('nbt11773_弹窗_图3.png');
  await page.evaluate(() => { const b=document.getElementById('kbClose'); if(b) b.click(); });
  await sleep(200);

  // ===== nbt10991 (card 2) =====
  console.log('== nbt10991 ==');
  await openCourse(2);
  await gotoSlide(6, 2); // ch07 (idx6) slide[2] 安全锁
  await shot('nbt10991_讲解_安全锁.png');
  await gotoQuestion(14, 8); // ch14 9m/min题(实际idx8)
  await shot('nbt10991_题目_启锁速度.png');
  await openKbFig('附录A');
  await shot('nbt10991_弹窗_附录A.png');
  await page.evaluate(() => { const b=document.getElementById('kbClose'); if(b) b.click(); });

  await browser.close();
  console.log('\n截图完成: ' + OUT);
})().catch(e => { console.error('ERR', e); process.exit(1); });
