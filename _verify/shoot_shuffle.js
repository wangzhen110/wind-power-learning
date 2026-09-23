/* 选择题乱序 · 真浏览器截图
   1) 练习模式：同一道单选题，重进 2 次截 2 张，对比选项顺序不同
   2) 模拟考试：随机乱序题面截 1 张
*/
'use strict';
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'http://127.0.0.1:8765/index.html';
const SHOT_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('dialog', async d => { await d.accept(); });

  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.click('#tabReg');
  await page.type('#rgUser', 'shuffleshot1');
  await page.type('#rgNick', '乱序截图');
  await page.type('#rgPass', 'shot1234');
  await page.type('#rgPass2', 'shot1234');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}), page.click('#formReg .auth-btn')]);
  await page.waitForSelector('.portal-card', { timeout: 10000 });
  await page.evaluate(() => document.querySelectorAll('.portal-card')[0].querySelector('.pc-btn').click());
  await page.waitForFunction(() => document.getElementById('lecTitle').textContent !== '正在加载课程数据…', { timeout: 20000 });

  // 切到答题模式，筛选单选题
  await page.evaluate(() => {
    document.querySelector('.mode-btn[data-view="quiz"]').click();
  });
  await sleep(500);
  await page.evaluate(() => {
    document.getElementById('fChapter').value = 'all';
    document.getElementById('fType').value = 'single';
    document.getElementById('fScope').value = 'all';
    document.getElementById('fType').dispatchEvent(new Event('change', { bubbles: true }));
  });
  await sleep(500);

  async function readOrder() {
    return page.evaluate(() => Array.from(document.querySelectorAll('#qOptions .opt')).map(el => {
      const o = el.getAttribute('data-o');
      const letter = el.querySelector('.letter') ? el.querySelector('.letter').textContent : '';
      const txt = (el.children && el.children[1]) ? el.children[1].textContent : el.textContent;
      return letter + ':' + o + ':' + txt.trim().slice(0, 12);
    }));
  }
  async function rerender() {
    await page.evaluate(() => { const c = document.querySelector('#jumpGrid .cur'); if (c) c.click(); });
    await sleep(400);
  }

  // 截第1张
  const order1 = await readOrder();
  await page.screenshot({ path: path.join(SHOT_DIR, 'shuffle_quiz_pass1.png') });
  console.log('pass1 order:', order1.join(' | '));

  // 重进直到顺序不同（最多15次）
  let order2 = order1, tries = 0;
  while (JSON.stringify(order2) === JSON.stringify(order1) && tries < 15) {
    await rerender();
    order2 = await readOrder();
    tries++;
  }
  await page.screenshot({ path: path.join(SHOT_DIR, 'shuffle_quiz_pass2.png') });
  console.log('pass2 order:', order2.join(' | '));
  console.log('rerender tries to differ:', tries, '| same?', JSON.stringify(order1) === JSON.stringify(order2));

  // 模拟考试乱序题面
  await page.evaluate(() => document.querySelector('.mode-btn[data-view="exam"]').click());
  await sleep(400);
  await page.evaluate(() => {
    document.getElementById('exQuizCount').value = 10;
    document.getElementById('exFillCount').value = 0;
    document.getElementById('exDuration').value = 30;
    document.getElementById('exStart').click();
  });
  await sleep(600);
  await page.screenshot({ path: path.join(SHOT_DIR, 'shuffle_exam_running.png') });
  const exOrder = await page.evaluate(() => Array.from(document.querySelectorAll('#exQOptions .opt')).map(el => {
    const letter = el.querySelector('.letter') ? el.querySelector('.letter').textContent : '';
    return letter + ':' + el.getAttribute('data-o');
  }));
  console.log('exam running options:', exOrder.join(' | '));

  await browser.close();
  console.log('SCREENSHOT DONE');
})().catch(e => { console.error('截图异常：', e); process.exit(1); });
