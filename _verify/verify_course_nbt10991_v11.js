/* 统一学习平台 · nbt10991 · v11 Service Worker 真浏览器只读验证
   缓存名：wind-learning-unified-v11
   本脚本只读：不修改 sw.js/app.js/index.html/data/*，不做 git 操作 */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'http://127.0.0.1:8765/index.html';
const SHOT = path.join(__dirname, 'screenshots', 'v11_nbt10991.png');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const userDataDir = path.join(os.tmpdir(), 'v11_nbt10991_profile');
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
    userDataDir: userDataDir
  });
  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });

  let navCount = 0;
  page.on('framenavigated', f => { if (f === page.mainFrame()) navCount++; });

  console.log('== 1. 打开平台（容忍 v11 SW 首次激活自动 reload 一次） ==');
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  // 等登录表单稳定；若 3 秒窗口内又发生导航（SW reload），则继续等下一轮
  let stable = false;
  for (let i = 0; i < 4; i++) {
    await page.waitForSelector('#rgUser', { timeout: 30000 });
    const n0 = navCount;
    await sleep(3000);
    if (navCount === n0) { stable = true; break; }
  }
  ok('登录表单渲染稳定', await page.evaluate(() => !!document.querySelector('#rgUser')));
  ok('停留3秒无循环刷新', stable, '窗口内仍有导航');

  console.log('== 2. 注册账号 → 门户 ==');
  await page.click('#tabReg');
  await page.type('#rgUser', 'vfy_nbt91');
  await page.type('#rgNick', 'NBT91验证');
  await page.type('#rgPass', 'test1234');
  await page.type('#rgPass2', 'test1234');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {}),
    page.click('#formReg .auth-btn')
  ]);
  await page.waitForSelector('.portal-card', { timeout: 10000 });
  const cardCount = await page.evaluate(() => document.querySelectorAll('.portal-card').length);
  ok('门户 3 张课程卡片', cardCount === 3, '实际 ' + cardCount);

  console.log('== 3. 进入课程 nbt10991（门户第 2 张卡） ==');
  await page.evaluate(() => document.querySelectorAll('.portal-card')[2].querySelector('.pc-btn').click());
  await page.waitForFunction(() => document.getElementById('lecTitle').textContent !== '正在加载课程数据…', { timeout: 20000 });
  const courseTitle = await page.evaluate(() => document.getElementById('courseTitle').textContent.trim());
  const totalCount = await page.evaluate(() => document.getElementById('totalCount').textContent.trim());
  const chapCount = await page.evaluate(() => document.querySelectorAll('#chapNav .chap-item').length);
  ok('课程标题含「塔架升降机」', /塔架升降机/.test(courseTitle), courseTitle);
  ok('选择题总量 totalCount=198', totalCount === '198', '实际 ' + totalCount);
  ok('章节数=14', chapCount === 14, '实际 ' + chapCount);

  console.log('== 4. Service Worker 状态 ==');
  const swState = await page.evaluate(async () => {
    try {
      const c = navigator.serviceWorker && navigator.serviceWorker.controller;
      const keys = await caches.keys();
      return { hasCtrl: !!c, url: c ? c.scriptURL : '', keys: keys };
    } catch (e) { return { hasCtrl: false, url: '', keys: [], err: String(e) }; }
  });
  ok('SW controller 非空', swState.hasCtrl, swState.url);
  ok('controller scriptURL 含 sw.js', /sw\.js$/.test(swState.url), swState.url);
  ok('Cache 含 wind-learning-unified-v11', swState.keys.indexOf('wind-learning-unified-v11') >= 0, 'keys=' + JSON.stringify(swState.keys));

  console.log('== 5. 讲解视图 + 截图 ==');
  const slideLen = await page.evaluate(() => document.getElementById('lecSlide').textContent.trim().length);
  ok('讲解页 lecSlide 有内容', slideLen > 10, '长度 ' + slideLen);
  const idxBefore = await page.evaluate(() => document.getElementById('lecIdx').textContent.trim());
  const slideBefore = await page.evaluate(() => document.getElementById('lecSlide').textContent.trim());
  await page.click('#lecNext');
  await sleep(600);
  const idxAfter = await page.evaluate(() => document.getElementById('lecIdx').textContent.trim());
  const slideAfter = await page.evaluate(() => document.getElementById('lecSlide').textContent.trim());
  ok('讲解翻页（lecIdx 或内容变化）', idxAfter !== idxBefore || slideAfter !== slideBefore, idxBefore + ' -> ' + idxAfter);
  await page.screenshot({ path: SHOT, fullPage: false });
  ok('截图已保存', fs.existsSync(SHOT), SHOT);

  console.log('== 6. 答题（选择题） ==');
  await page.evaluate(() => document.getElementById('lecToQuiz').click());
  await page.waitForSelector('#qOptions .opt', { timeout: 8000 });
  await page.click('#qOptions .opt');
  await page.waitForFunction(() => !document.getElementById('qFeedback').classList.contains('hidden'), { timeout: 5000 });
  const fb1 = await page.evaluate(() => document.getElementById('qFeedback').textContent.trim().length);
  ok('第1题判分反馈出现', fb1 > 0, '长度 ' + fb1);
  // 推进到下一题再答一次
  await page.evaluate(() => document.getElementById('qNext').click());
  await page.waitForFunction(() => document.querySelectorAll('#qOptions .opt').length > 0 &&
    document.getElementById('qFeedback').classList.contains('hidden'), { timeout: 5000 });
  await page.click('#qOptions .opt');
  await page.waitForFunction(() => !document.getElementById('qFeedback').classList.contains('hidden'), { timeout: 5000 });
  ok('第2题作答并出现判分反馈', true);

  console.log('== 7. 填空视图 ==');
  await page.evaluate(() => document.querySelector('.mode-btn[data-view="fill"]').click());
  await page.waitForFunction(() => !document.getElementById('view-fill').classList.contains('hidden'), { timeout: 5000 });
  const fjump = await page.evaluate(() => document.querySelectorAll('#fjumpGrid > *').length);
  const ffRange = await page.evaluate(() => document.getElementById('ffRange').textContent.trim());
  const fqText = await page.evaluate(() => document.getElementById('fqText').textContent.trim());
  ok('填空视图显示', true);
  ok('填空跳转格 fjumpGrid=85', fjump === 85, '实际 ' + fjump);
  ok('ffRange 体现共85题', /85/.test(ffRange), ffRange);
  ok('填空题 fqText 有题目文本', fqText.length > 5, '长度 ' + fqText.length);
  await page.evaluate(() => {
    document.querySelectorAll('#fqOptions .fill-input').forEach(i => { i.value = '占位'; });
    document.getElementById('fqNext').click();
  });
  await page.waitForFunction(() => !document.getElementById('fqFeedback').classList.contains('hidden'), { timeout: 5000 });
  const ffb = await page.evaluate(() => document.getElementById('fqFeedback').textContent.trim().length);
  ok('填空提交后 fqFeedback 反馈出现', ffb > 0, '长度 ' + ffb);

  console.log('== 8. 模拟考试入口 ==');
  await page.evaluate(() => document.querySelector('.mode-btn[data-view="exam"]').click());
  await page.waitForFunction(() => !document.getElementById('view-exam').classList.contains('hidden'), { timeout: 5000 });
  const exChoice = await page.evaluate(() => document.getElementById('exAvailChoice').textContent.trim());
  const exFill = await page.evaluate(() => document.getElementById('exAvailFill').textContent.trim());
  ok('考试配置 exAvailChoice=198', exChoice === '198', '实际 ' + exChoice);
  ok('考试配置 exAvailFill=85', exFill === '85', '实际 ' + exFill);
  await page.evaluate(() => {
    function setVal(id, v) { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
    setVal('exFillCount', 0); setVal('exQuizCount', 5); setVal('exDuration', 5);
  });
  await page.evaluate(() => document.getElementById('exStart').click());
  await page.waitForFunction(() => !document.getElementById('exRunning').classList.contains('hidden'), { timeout: 10000 });
  const exQText = await page.evaluate(() => document.getElementById('exQText').textContent.trim());
  const exOpts = await page.evaluate(() => document.querySelectorAll('#exQOptions .opt').length);
  ok('考试开始（考题渲染）', exQText.length > 5 && exOpts > 0, '题目长度 ' + exQText.length + '，选项 ' + exOpts);
  // 尝试用页面内控件交卷退出（失败不阻断）
  try { await page.click('#exSubmit'); await sleep(800); } catch (e) {}

  console.log('');
  console.log('关键实际值：课程=[' + courseTitle + '] 选择题=' + totalCount + ' 章节=' + chapCount +
    ' 填空格=' + fjump + ' 缓存keys=' + JSON.stringify(swState.keys));
  console.log('真浏览器验证结果：' + pass + ' 通过 / ' + fail + ' 失败');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('脚本异常：', e); process.exit(2); });
