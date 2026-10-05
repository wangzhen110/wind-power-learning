/* gbt46154 · v11 SW 真浏览器只读验证（puppeteer-core + 真 Edge）
   课程：GB/T 46154—2025《风力发电机组用电梯制造与安装安全规范》
   缓存名：wind-learning-unified-v11
   只读：不改任何产品文件；仅新建本脚本、1 张截图、独立临时浏览器 profile。 */
'use strict';
const puppeteer = require('puppeteer-core');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'http://127.0.0.1:8765/index.html';
const V11 = 'wind-learning-unified-v11';
const SHOT = path.join('D:', '学习', '体系文件', '统一学习平台', '_verify', 'screenshots', 'v11_gbt46154.png');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const userDataDir = path.join(os.tmpdir(), 'v11_gbt46154_profile');
  // 每次干净 profile，避免上次登录态干扰注册流程
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  console.log('临时 profile: ' + userDataDir);
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: 'new', userDataDir,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  page.on('dialog', async d => { await d.accept(); });

  const navs = [];
  page.on('framenavigated', f => { if (f === page.mainFrame()) navs.push(f.url()); });
  page.on('pageerror', e => console.log('  [pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('  [console.error] ' + m.text()); });

  try {
    /* ===== 1. 打开平台（容忍 v11 首次激活自动 reload 一次） ===== */
    console.log('== 1. 打开平台 / SW 首次激活自动 reload 容忍 ==');
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });

    // 轮询等待：登录表单稳定 + SW 已激活且完成过一次自动 reload（容忍中途 reload 摧毁上下文）
    let settled = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      try {
        const st = await page.evaluate(() => ({
          loginVisible: !!(document.getElementById('view-login') &&
                           !document.getElementById('view-login').classList.contains('hidden') &&
                           document.getElementById('tabReg')),
          ctrl: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
          reloaded: sessionStorage.getItem('sw_reloaded') === '1',
        }));
        if (st.loginVisible && st.ctrl && st.reloaded) { settled = true; break; }
      } catch (e) { /* reload 摧毁上下文，下轮重试 */ }
      await sleep(500);
    }
    ok('登录表单已稳定渲染', settled);
    // 停留 3 秒确认不会循环刷新
    const n0 = navs.length;
    await sleep(3000);
    const n1 = navs.length;
    ok('激活后停留 3s 无第二次导航（不无限刷新）', n0 === n1, 'navs=' + JSON.stringify(navs));

    /* ===== 2. 注册 → 门户 3 张卡片 ===== */
    console.log('== 2. 注册并进入门户 ==');
    await page.click('#tabReg');
    await page.type('#rgUser', 'vfy_gbt');
    await page.type('#rgNick', 'GBT验证');
    await page.type('#rgPass', 'test1234');
    await page.type('#rgPass2', 'test1234');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {}),
      page.click('#formReg .auth-btn'),
    ]);
    await page.waitForSelector('.portal-card', { timeout: 10000 });
    const cardCount = await page.evaluate(() => document.querySelectorAll('.portal-card').length);
    ok('注册后进入门户且共 3 张课程卡片', cardCount === 3, '实际 ' + cardCount);

    /* ===== 3. 进入第 0 门课程 gbt46154 ===== */
    console.log('== 3. 进入 gbt46154 课程 ==');
    await page.evaluate(() => document.querySelectorAll('.portal-card')[0].querySelector('.pc-btn').click());
    await page.waitForFunction(() => document.getElementById('lecTitle').textContent !== '正在加载课程数据…', { timeout: 20000 });
    const titleTxt = await page.evaluate(() => document.getElementById('courseTitle').textContent);
    ok('课程标题含“电梯制造与安装安全规范”', /电梯制造与安装安全规范/.test(titleTxt), titleTxt.trim());
    const total = await page.evaluate(() => document.getElementById('totalCount').textContent);
    ok('选择题总量 #totalCount = 330', total === '330', '实际 ' + total);
    const chapN = await page.evaluate(() => document.querySelectorAll('#chapNav .chap-item').length);
    ok('章节数 #chapNav .chap-item = 14', chapN === 14, '实际 ' + chapN);

    /* ===== 4. SW 状态与 v11 缓存 ===== */
    console.log('== 4. Service Worker 状态与缓存名 ==');
    const swInfo = await page.evaluate(async () => {
      const ckeys = await caches.keys();
      return {
        hasController: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
        scriptURL: navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : null,
        cacheKeys: ckeys,
      };
    });
    ok('navigator.serviceWorker.controller 非空', swInfo.hasController);
    ok('controller.scriptURL 含 sw.js', !!swInfo.scriptURL && /sw\.js$/.test(swInfo.scriptURL), swInfo.scriptURL);
    ok('caches.keys() 含 wind-learning-unified-v11', swInfo.cacheKeys.indexOf(V11) !== -1, JSON.stringify(swInfo.cacheKeys));

    /* ===== 5. 讲解视图：翻屏 + 截图 ===== */
    console.log('== 5. 讲解视图翻屏与截图 ==');
    await sleep(400);
    const slideLen = await page.evaluate(() => document.getElementById('lecSlide').innerText.trim().length);
    ok('#lecSlide 有讲解内容', slideLen > 0, '长度 ' + slideLen);
    const before = await page.evaluate(() => ({
      idx: document.getElementById('lecIdx').textContent,
      bar: document.getElementById('lecBar').style.width || '',
      txt: document.getElementById('lecSlide').innerText.length,
    }));
    await page.click('#lecNext');
    await sleep(400);
    const after = await page.evaluate(() => ({
      idx: document.getElementById('lecIdx').textContent,
      bar: document.getElementById('lecBar').style.width || '',
      txt: document.getElementById('lecSlide').innerText.length,
    }));
    const moved = (after.idx !== before.idx) || (after.bar !== before.bar) || (after.txt !== before.txt);
    ok('点 lecNext 后 lecIdx/进度条/内容有变化', moved,
      JSON.stringify(before) + ' -> ' + JSON.stringify(after));
    await page.screenshot({ path: SHOT, fullPage: false });
    ok('截图已保存 v11_gbt46154.png', fs.existsSync(SHOT), SHOT);

    /* ===== 6. 答题（判分反馈 ×2） ===== */
    console.log('== 6. 答题判分 ==');
    await page.click('#lecToQuiz');
    await page.waitForSelector('#qOptions .opt', { timeout: 8000 });
    // lecToQuiz 默认只取当前章节题；放宽到全部章节，保证题库足够连答 2 题
    await page.evaluate(() => {
      const fc = document.getElementById('fChapter');
      fc.value = 'all';
      fc.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForFunction(() => {
      const m = /^(\d+) \/ (\d+)$/.exec(document.getElementById('qIdx').textContent);
      return m && parseInt(m[2], 10) >= 2;
    }, { timeout: 6000 });
    const poolSize = await page.evaluate(() => document.getElementById('qIdx').textContent);
    ok('答题池已放宽（qIdx=' + poolSize + '）', true);
    async function answerOne() {
      await page.waitForSelector('#qOptions .opt', { timeout: 5000 });
      const typeTxt = await page.evaluate(() => document.getElementById('qType').textContent);
      await page.click('#qOptions .opt');
      let shown = await page.waitForFunction(() => !document.getElementById('qFeedback').classList.contains('hidden'), { timeout: 3000 })
        .then(() => true).catch(() => false);
      if (!shown) { // 多选：选项仅选中，需点提交
        await page.evaluate(() => document.getElementById('qNext').click());
        await page.waitForFunction(() => !document.getElementById('qFeedback').classList.contains('hidden'), { timeout: 5000 });
      }
      return typeTxt;
    }
    const t1 = await answerOne();
    ok('第 1 题判分反馈出现（题型 ' + t1 + '）', true);
    // 推进到第 2 题：以 qIdx 变化作为渲染完成信号（DOM .click 触发，避免坐标被遮挡）
    const idxBefore = await page.evaluate(() => document.getElementById('qIdx').textContent);
    await page.evaluate(() => document.getElementById('qNext').click());
    await page.waitForFunction((prev) => document.getElementById('qIdx').textContent !== prev,
      { timeout: 6000 }, idxBefore);
    const idxAfter = await page.evaluate(() => document.getElementById('qIdx').textContent);
    ok('从第 1 题推进到第 2 题（qIdx ' + idxBefore + ' -> ' + idxAfter + '）', true);
    const t2 = await answerOne();
    ok('第 2 题判分反馈出现（题型 ' + t2 + '）', true);

    /* ===== 7. 填空视图（题库 74） ===== */
    console.log('== 7. 填空视图 ==');
    await page.evaluate(() => document.querySelector('.mode-btn[data-view="fill"]').click());
    await page.waitForSelector('#fqOptions .fill-input', { timeout: 8000 });
    const fillVisible = await page.evaluate(() => !document.getElementById('view-fill').classList.contains('hidden'));
    ok('#view-fill 不再 hidden', fillVisible);
    const rangeTxt = await page.evaluate(() => document.getElementById('ffRange').textContent);
    ok('#ffRange 体现共 74 题', /74/.test(rangeTxt), rangeTxt);
    const gridN = await page.evaluate(() => document.querySelectorAll('#fjumpGrid > *').length);
    ok('#fjumpGrid 格子总数 = 74', gridN === 74, '实际 ' + gridN);
    const fqLen = await page.evaluate(() => document.getElementById('fqText').textContent.trim().length);
    ok('#fqText 有题目文本', fqLen > 5, '长度 ' + fqLen);
    // 答错提交一次，断言反馈区出现
    await page.evaluate(() => {
      document.querySelectorAll('#fqOptions .fill-input').forEach(i => { i.value = '占位答案XX'; });
      document.getElementById('fqNext').click();
    });
    await page.waitForFunction(() => !document.getElementById('fqFeedback').classList.contains('hidden'), { timeout: 5000 });
    ok('填空提交后 #fqFeedback 反馈区显示', true);

    /* ===== 8. 模拟考试入口（组卷可用） ===== */
    console.log('== 8. 模拟考试配置与组卷 ==');
    await page.evaluate(() => document.querySelector('.mode-btn[data-view="exam"]').click());
    await page.waitForSelector('#exAvailChoice', { timeout: 5000 });
    const exChoice = await page.evaluate(() => document.getElementById('exAvailChoice').textContent);
    ok('#exAvailChoice = 330', exChoice === '330', '实际 ' + exChoice);
    const exFill = await page.evaluate(() => document.getElementById('exAvailFill').textContent);
    ok('#exAvailFill = 74', exFill === '74', '实际 ' + exFill);
    await page.evaluate(() => {
      document.getElementById('exFillCount').value = '0';
      document.getElementById('exQuizCount').value = '5';
      document.getElementById('exDuration').value = '5';
    });
    await page.click('#exStart');
    await page.waitForFunction(() => !document.getElementById('exRunning').classList.contains('hidden'), { timeout: 8000 });
    const exQLen = await page.evaluate(() => document.getElementById('exQText').textContent.trim().length);
    const exGridN = await page.evaluate(() => document.querySelectorAll('#exJumpGrid .jump-btn').length);
    ok('考试开始（考题渲染，#exQText 有题干）', exQLen > 5, '长度 ' + exQLen);
    ok('组卷题量 = 5（答题卡 5 格）', exGridN === 5, '实际 ' + exGridN);
    // 用页面内控件交卷 → 回到配置（DOM .click，避免坐标被遮挡；确认弹窗自动接受）
    try {
      await page.evaluate(() => document.getElementById('exSubmit').click());
      await page.waitForFunction(() => !document.getElementById('exResult').classList.contains('hidden'), { timeout: 6000 });
      await page.evaluate(() => document.getElementById('exRetry').click());
      await page.waitForFunction(() => !document.getElementById('exConfig').classList.contains('hidden'), { timeout: 6000 });
      ok('交卷→再考一次，回到考试配置', true);
    } catch (e) {
      ok('交卷/返回控件走通（失败不阻断，考题渲染已断言）', false, String(e).split('\n')[0]);
    }
  } catch (e) {
    fail++;
    console.error('脚本异常：', e);
  } finally {
    await browser.close();
  }

  console.log('');
  console.log('gbt46154 v11 真浏览器验证结果：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('脚本顶层异常：', e); process.exit(2); });
