/* 三套课程模拟考试界面截图：config 面板 + running 界面 */
'use strict';
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'http://127.0.0.1:8765/index.html';
const SHOT_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

const COURSES = ['gbt46154', 'nbt11773', 'nbt10991'];

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('dialog', async d => { await d.accept(); });

  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  // 注册截图专用账号
  await page.click('#tabReg');
  await page.type('#rgUser', 'shotuser');
  await page.type('#rgNick', '截图账号');
  await page.type('#rgPass', 'shot123');
  await page.type('#rgPass2', 'shot123');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {}), page.click('#formReg .auth-btn')]);
  await page.waitForSelector('.portal-card', { timeout: 10000 });

  for (let i = 0; i < COURSES.length; i++) {
    const cid = COURSES[i];
    console.log('== 课程 ' + cid + ' ==');
    await page.evaluate(idx => document.querySelectorAll('.portal-card')[idx].querySelector('.pc-btn').click(), i);
    await page.waitForFunction(() => document.getElementById('lecTitle').textContent !== '正在加载课程数据…', { timeout: 20000 });
    // 切到模拟考试
    await page.evaluate(() => { const b = document.querySelector('.mode-btn[data-view="exam"]'); if (b) b.click(); });
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: path.join(SHOT_DIR, 'exam_' + cid + '_config.png') });
    console.log('  已保存 config');
    // 开始考试（小卷：5 选择 + 2 填空，5 分钟）
    await page.evaluate(() => {
      document.getElementById('exQuizCount').value = 5;
      document.getElementById('exFillCount').value = 2;
      document.getElementById('exDuration').value = 5;
      document.getElementById('exStart').click();
    });
    await page.waitForSelector('#exQText', { timeout: 5000 });
    await new Promise(r => setTimeout(r, 300));
    await page.screenshot({ path: path.join(SHOT_DIR, 'exam_' + cid + '_running.png') });
    console.log('  已保存 running');
    // 回门户准备下一门
    await page.evaluate(() => document.getElementById('btnBackPortal').click());
    await page.waitForSelector('.portal-card', { timeout: 5000 });
    await new Promise(r => setTimeout(r, 200));
  }

  await browser.close();
  console.log('截图完成，目录：' + SHOT_DIR);
  process.exit(0);
})().catch(e => { console.error('脚本异常：', e); process.exit(2); });
