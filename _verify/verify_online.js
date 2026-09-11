/* 线上站点最终验证：登录 → 门户 → 课程 → 答题 → 知识库 → 账号隔离 */
'use strict';
const puppeteer = require('puppeteer-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'https://wangzhen110.github.io/wind-power-learning/';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  page.on('dialog', async d => await d.accept());
  const stamp = Date.now().toString(36);
  const userA = 'testa_' + stamp, userB = 'testb_' + stamp;

  console.log('== 线上：注册账号 A 并完成答题流程 ==');
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });
  ok('线上打开登录页', await page.evaluate(() => !document.getElementById('view-login').classList.contains('hidden')));
  await page.click('#tabReg');
  await page.type('#rgUser', userA);
  await page.type('#rgNick', '线上验证A');
  await page.type('#rgPass', 'pass123');
  await page.type('#rgPass2', 'pass123');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {}), page.click('#formReg .auth-btn')]);
  await page.waitForSelector('.portal-card', { timeout: 20000 });
  ok('注册进入门户', true);
  ok('门户三课程', await page.evaluate(() => document.querySelectorAll('.portal-card').length === 3));

  await page.evaluate(() => document.querySelectorAll('.portal-card')[0].querySelector('.pc-btn').click());
  await page.waitForFunction(() => document.getElementById('lecTitle').textContent !== '正在加载课程数据…', { timeout: 30000 });
  ok('课程1加载（330题）', await page.evaluate(() => document.getElementById('totalCount').textContent === '330'));
  await page.click('#lecToQuiz');
  await page.waitForSelector('#qOptions .opt', { timeout: 10000 });
  await page.click('#qOptions .opt');
  await page.waitForFunction(() => !document.getElementById('qFeedback').classList.contains('hidden'), { timeout: 5000 });
  ok('答题判分反馈', true);
  await page.evaluate(() => document.querySelector('#fbSource .src-link').click());
  await page.waitForFunction(() => !document.getElementById('kbModal').classList.contains('hidden'), { timeout: 5000 });
  ok('知识库弹窗（线上）', await page.evaluate(() => document.getElementById('kbBody').textContent.length > 5));

  console.log('== 线上：账号隔离 ==');
  await page.evaluate(() => document.getElementById('btnBackPortal').click());
  await page.waitForSelector('.portal-card', { timeout: 5000 });
  ok('A 进度≥1', /已答 [1-9]/.test(await page.evaluate(() => document.querySelectorAll('.portal-card')[0].querySelector('.pc-progress').textContent)));
  await page.evaluate(() => document.getElementById('btnLogout').click());
  await page.waitForFunction(() => !document.getElementById('view-login').classList.contains('hidden'), { timeout: 5000 });
  await page.click('#tabReg');
  await page.type('#rgUser', userB);
  await page.type('#rgNick', '线上验证B');
  await page.type('#rgPass', 'pass123');
  await page.type('#rgPass2', 'pass123');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {}), page.click('#formReg .auth-btn')]);
  await page.waitForSelector('.portal-card', { timeout: 20000 });
  ok('B 进度为 0（隔离）', /已答 0/.test(await page.evaluate(() => document.querySelectorAll('.portal-card')[0].querySelector('.pc-progress').textContent)));

  console.log('== 线上：移动端布局 ==');
  await page.setViewport({ width: 390, height: 844 });
  await new Promise(r => setTimeout(r, 400));
  const probe = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const docW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    return { overflow: docW > vw + 1, vw, docW };
  });
  ok('门户移动端无横向溢出', !probe.overflow, JSON.stringify(probe));

  console.log('');
  console.log('线上验证结果：' + pass + ' 通过 / ' + fail + ' 失败');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('脚本异常：', e); process.exit(2); });
