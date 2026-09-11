/* 统一学习平台 · Edge 真浏览器验证
   流程：登录页渲染 → 注册 → 门户 → 三课程切换 → 答题判分 → 填空 → 统计
   布局：多种视口检测横向溢出/遮挡/重叠（登录页 + 门户 + 课程三视图） */
'use strict';
const puppeteer = require('puppeteer-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'http://127.0.0.1:8765/index.html';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

const PROBE = `(() => {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const issues = [];
  const docW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  if (docW > vw + 1) issues.push({ type: 'H-OVERFLOW', msg: '页面宽 ' + docW + ' > 视口 ' + vw });
  document.querySelectorAll('body *').forEach(el => {
    if (el.scrollWidth > el.clientWidth + 1) {
      let canScroll = false;
      for (let p = el; p && p !== document.body; p = p.parentElement) {
        const s = window.getComputedStyle(p);
        if (/(auto|scroll|overlay)/.test(s.overflowX)) { canScroll = true; break; }
      }
      if (!canScroll && el.clientWidth > 0) {
        issues.push({ type: 'C-CLIP', msg: el.tagName + '.' + (el.className || '').toString().split(' ')[0] + ' 宽 ' + el.scrollWidth + '>' + el.clientWidth });
      }
    }
  });
  return { vw, vh, issues };
})()`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  page.on('dialog', async d => { await d.accept(); });

  console.log('== A. 登录页渲染与布局（多视口） ==');
  const viewports = [
    { w: 390, h: 844, label: '手机 390×844' },
    { w: 320, h: 640, label: '小屏 320×640' },
    { w: 1440, h: 900, label: '桌面 1440×900' }
  ];
  for (const vp of viewports) {
    await page.setViewport({ width: vp.w, height: vp.h });
    await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
    const r = await page.evaluate(PROBE);
    ok('登录页无溢出/裁切 [' + vp.label + ']', r.issues.length === 0, JSON.stringify(r.issues.slice(0, 3)));
    const title = await page.title();
    ok('登录页标题正确 [' + vp.label + ']', title.indexOf('统一登录') >= 0, title);
  }

  console.log('== B. 注册 → 门户 → 课程全流程 ==');
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.click('#tabReg');
  await page.type('#rgUser', 'wangzhen');
  await page.type('#rgNick', '王工');
  await page.type('#rgPass', 'test123');
  await page.type('#rgPass2', 'test123');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {}), page.click('#formReg .auth-btn')]);
  await page.waitForSelector('.portal-card', { timeout: 10000 });
  ok('注册后进入门户', await page.evaluate(() => !document.getElementById('view-portal').classList.contains('hidden')));
  ok('门户显示昵称', await page.evaluate(() => /王工/.test(document.getElementById('portalUser').textContent)));
  const cardCount = await page.evaluate(() => document.querySelectorAll('.portal-card').length);
  ok('门户 3 张课程卡片', cardCount === 3, '实际 ' + cardCount);

  // 进入课程 1
  await page.evaluate(() => document.querySelectorAll('.portal-card')[0].querySelector('.pc-btn').click());
  await page.waitForFunction(() => document.getElementById('lecTitle').textContent !== '正在加载课程数据…', { timeout: 20000 });
  ok('课程1加载完成', await page.evaluate(() => document.getElementById('totalCount').textContent === '330'));
  ok('课程1标题正确', await page.evaluate(() => /电梯制造与安装安全规范/.test(document.getElementById('courseTitle').textContent)));
  ok('课程1章节14', await page.evaluate(() => document.querySelectorAll('#chapNav .chap-item').length === 14));

  // 答题
  await page.click('#lecToQuiz');
  await page.waitForSelector('#qOptions .opt', { timeout: 5000 });
  const q1 = await page.evaluate(() => document.getElementById('qText').textContent);
  ok('答题卡显示题目', q1.length > 10);
  await page.click('#qOptions .opt');
  await page.waitForFunction(() => !document.getElementById('qFeedback').classList.contains('hidden'), { timeout: 5000 });
  ok('单选判分出现反馈', true);
  ok('反馈含出处', await page.evaluate(() => /出处/.test(document.getElementById('fbSource').textContent)));
  await page.evaluate(() => document.querySelector('#fbSource .src-link').click());
  await page.waitForFunction(() => !document.getElementById('kbModal').classList.contains('hidden'), { timeout: 3000 });
  ok('知识库弹窗打开', true);
  ok('知识库有条款内容', await page.evaluate(() => document.getElementById('kbBody').textContent.length > 5));

  // 填空
  await page.evaluate(() => document.querySelector('.mode-btn[data-view="fill"]').click());
  await page.waitForSelector('#fqOptions .fill-input', { timeout: 5000 });
  const fillCount = await page.evaluate(() => document.querySelectorAll('#fqOptions .fill-input').length);
  ok('填空题渲染输入框', fillCount >= 1, '实际 ' + fillCount);
  await page.evaluate(() => { document.querySelectorAll('#fqOptions .fill-input').forEach(i => i.value = '占位'); document.getElementById('fqNext').click(); });
  await page.waitForFunction(() => !document.getElementById('fqFeedback').classList.contains('hidden'), { timeout: 5000 });
  ok('填空判分出现反馈', true);

  // 统计
  await page.evaluate(() => document.querySelector('.mode-btn[data-view="stats"]').click());
  await page.waitForSelector('#statCards .scard', { timeout: 5000 });
  ok('统计卡片渲染', await page.evaluate(() => document.querySelectorAll('#statCards .scard').length === 6));

  console.log('== C. 课程布局（讲解/答题/填空/统计 多视口） ==');
  for (const vp of [{ w: 390, h: 844, label: '手机' }, { w: 320, h: 640, label: '小屏' }, { w: 844, h: 390, label: '横屏' }]) {
    await page.setViewport({ width: vp.w, height: vp.h });
    await new Promise(r => setTimeout(r, 300));
    for (const v of ['lecture', 'quiz', 'fill', 'stats']) {
      await page.evaluate(v => { const b = document.querySelector('.mode-btn[data-view="' + v + '"]'); if (b) b.click(); }, v);
      await new Promise(r => setTimeout(r, 250));
      const r = await page.evaluate(PROBE);
      ok('课程[' + v + '] 无溢出 [' + vp.label + ']', r.issues.length === 0, JSON.stringify(r.issues.slice(0, 3)));
    }
  }

  console.log('== D. 课程切换与账号隔离 ==');
  await page.setViewport({ width: 1280, height: 900 });
  await page.evaluate(() => document.getElementById('btnBackPortal').click());
  await page.waitForSelector('.portal-card', { timeout: 5000 });
  const progA = await page.evaluate(() => document.querySelectorAll('.portal-card')[0].querySelector('.pc-progress').textContent);
  ok('账号A课程1进度已答≥1', /已答 [1-9]/.test(progA), progA);
  await page.evaluate(() => document.getElementById('btnLogout').click());
  await page.waitForFunction(() => !document.getElementById('view-login').classList.contains('hidden'), { timeout: 5000 });
  ok('退出回到登录页', true);
  // 注册账号 B
  await page.click('#tabReg');
  await page.type('#rgUser', 'lisi2');
  await page.type('#rgNick', '李四');
  await page.type('#rgPass', 'abcd');
  await page.type('#rgPass2', 'abcd');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {}), page.click('#formReg .auth-btn')]);
  await page.waitForSelector('.portal-card', { timeout: 10000 });
  const progB = await page.evaluate(() => document.querySelectorAll('.portal-card')[0].querySelector('.pc-progress').textContent);
  ok('账号B课程1进度为0（数据隔离）', /已答 0/.test(progB), progB);
  await page.evaluate(() => document.querySelectorAll('.portal-card')[1].querySelector('.pc-btn').click());
  await page.waitForFunction(() => document.getElementById('lecTitle').textContent !== '正在加载课程数据…', { timeout: 20000 });
  ok('账号B进入课程2', await page.evaluate(() => document.getElementById('totalCount').textContent === '216'));

  console.log('');
  console.log('真浏览器结果：' + pass + ' 通过 / ' + fail + ' 失败');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('脚本异常：', e); process.exit(2); });
