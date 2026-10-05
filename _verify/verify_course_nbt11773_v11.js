/* 统一学习平台 · 课程 nbt11773 · v11 Service Worker 真浏览器只读验证（puppeteer-core + 真 Edge）
   缓存名：wind-learning-unified-v11
   覆盖：SW 首次激活自动 reload 且不循环 → 注册 → 门户3卡 → 进 nbt11773(卡片 index=1)
        → 题量216/章节9 → SW controller+v11缓存 → 讲解翻屏截图 → 答2题选择 → 填空81格
        → 模拟考试组卷(5选择/0填空/5分钟)。
   只读：不改任何产品文件；仅新建本脚本 + 1 张截图 + 独立临时 profile（启动前清空以复现首装）。 */
'use strict';
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'http://127.0.0.1:8765/index.html';
const SHOT_DIR = 'D:/学习/体系文件/统一学习平台/_verify/screenshots';
const SHOT = SHOT_DIR + '/v11_nbt11773.png';
const V11 = 'wind-learning-unified-v11';

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); fails.push(name + (extra ? ' :: ' + extra : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // 独立临时 profile；启动前清空，复现 v11 SW 首次安装激活（触发一次自动 reload）
  const userDataDir = path.join(os.tmpdir(), 'v11_nbt11773_profile');
  fs.rmSync(userDataDir, { recursive: true, force: true });
  if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: 'new',
    userDataDir,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('dialog', async d => { await d.accept(); });

  const navs = [];
  page.on('framenavigated', f => { if (f === page.mainFrame()) navs.push(f.url()); });

  try {
    console.log('== 1. 打开平台（容忍 v11 SW 首次激活自动 reload 一次） ==');
    await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });

    // 等待 SW 激活并完成那次 controllerchange 自动 reload（sw_reloaded=1 + controller 存在）
    await page.waitForFunction(
      () => navigator.serviceWorker && navigator.serviceWorker.controller &&
            sessionStorage.getItem('sw_reloaded') === '1',
      { timeout: 25000 }
    );
    ok('v11 SW 已激活并完成一次自动 reload（sw_reloaded=1）', true);

    // 登录表单稳定
    await page.waitForSelector('#tabReg', { visible: true, timeout: 10000 });
    ok('登录/注册表单稳定可见', true);

    // 防循环：停留 3 秒确认无第二次导航
    const navBefore = navs.length;
    await sleep(3000);
    const navAfter = navs.length;
    ok('激活后停留 3s 无第二次导航（不循环刷新）', navBefore === navAfter, 'navs=' + JSON.stringify(navs));

    console.log('== 2. 注册 vfy_nbt73 → 门户 ==');
    await page.click('#tabReg');
    await page.type('#rgUser', 'vfy_nbt73');
    await page.type('#rgNick', 'NBT73验证');
    await page.type('#rgPass', 'test1234');
    await page.type('#rgPass2', 'test1234');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {}),
      page.click('#formReg .auth-btn'),
    ]);
    await page.waitForSelector('.portal-card', { timeout: 10000 });
    const cardCount = await page.evaluate(() => document.querySelectorAll('.portal-card').length);
    ok('注册后进入门户', await page.evaluate(() => !document.getElementById('view-portal').classList.contains('hidden')));
    ok('门户共 3 张课程卡片', cardCount === 3, '实际 ' + cardCount);

    console.log('== 3. 进入 nbt11773（卡片 index=1） ==');
    await page.evaluate(() => document.querySelectorAll('.portal-card')[1].querySelector('.pc-btn').click());
    await page.waitForFunction(() => document.getElementById('lecTitle').textContent !== '正在加载课程数据…', { timeout: 20000 });

    const courseTitle = await page.evaluate(() => document.getElementById('courseTitle').textContent);
    const totalCount = await page.evaluate(() => document.getElementById('totalCount').textContent);
    const chapCount = await page.evaluate(() => document.querySelectorAll('#chapNav .chap-item').length);
    ok('#courseTitle 含“内附件”', /内附件/.test(courseTitle), courseTitle.trim());
    ok('#totalCount === 216', totalCount === '216', '实际 ' + totalCount);
    ok('#chapNav .chap-item === 9', chapCount === 9, '实际 ' + chapCount);

    console.log('== 4. Service Worker 状态与 v11 缓存 ==');
    const swInfo = await page.evaluate(async () => {
      const c = navigator.serviceWorker && navigator.serviceWorker.controller;
      const keys = await caches.keys();
      return {
        hasController: !!c,
        scriptURL: c ? c.scriptURL : null,
        cacheKeys: keys,
        hasV11: keys.indexOf('wind-learning-unified-v11') !== -1,
      };
    });
    ok('navigator.serviceWorker.controller 非空', swInfo.hasController);
    ok('controller.scriptURL 含 sw.js', !!swInfo.scriptURL && /sw\.js$/.test(swInfo.scriptURL), swInfo.scriptURL);
    ok('caches 包含 ' + V11, swInfo.hasV11, JSON.stringify(swInfo.cacheKeys));

    console.log('== 5. 讲解视图：翻屏 + 截图 ==');
    await sleep(400);
    // 若当前章已是最后一屏（lecNext 禁用），切到第 2 个章节保证可翻
    let lecBefore = await page.evaluate(() => ({
      idx: document.getElementById('lecIdx').textContent,
      bar: document.getElementById('lecBar').style.width || '',
      slideLen: (document.getElementById('lecSlide').textContent || '').replace(/\s+/g, ' ').trim().length,
      disabled: document.getElementById('lecNext').disabled,
    }));
    if (lecBefore.disabled) {
      await page.evaluate(() => document.querySelectorAll('#chapNav .chap-item')[1].click());
      await page.waitForFunction(() => document.getElementById('lecNext').disabled === false, { timeout: 5000 }).catch(() => {});
      await sleep(300);
      lecBefore = await page.evaluate(() => ({
        idx: document.getElementById('lecIdx').textContent,
        bar: document.getElementById('lecBar').style.width || '',
        slideLen: (document.getElementById('lecSlide').textContent || '').replace(/\s+/g, ' ').trim().length,
        disabled: document.getElementById('lecNext').disabled,
      }));
    }
    ok('#lecSlide 有讲解内容', lecBefore.slideLen > 20, '长度 ' + lecBefore.slideLen);
    await page.evaluate(() => document.getElementById('lecNext').click());
    await sleep(400);
    const lecAfter = await page.evaluate(() => ({
      idx: document.getElementById('lecIdx').textContent,
      bar: document.getElementById('lecBar').style.width || '',
    }));
    ok('点击 #lecNext 后 #lecIdx 或进度条变化',
      lecAfter.idx !== lecBefore.idx || lecAfter.bar !== lecBefore.bar,
      'idx ' + lecBefore.idx + ' -> ' + lecAfter.idx + ' | bar ' + lecBefore.bar + ' -> ' + lecAfter.bar);

    // 讲解视图（标题/章节可见）截图
    await page.screenshot({ path: SHOT });
    ok('已截取讲解视图截图', fs.existsSync(SHOT), SHOT);

    console.log('== 6. 答题（选择）：连答 2 题 ==');
    await page.evaluate(() => document.getElementById('lecToQuiz').click());
    await page.waitForSelector('#qOptions .opt', { timeout: 8000 });
    await sleep(300);

    async function answerOneQuiz() {
      // 任选一个选项
      await page.evaluate(() => document.querySelector('#qOptions .opt').click());
      await sleep(250);
      // 多选不会自动判分，需点 #qNext 提交；单选/判断点击即判分
      const st = await page.evaluate(() => ({
        fbHidden: document.getElementById('qFeedback').classList.contains('hidden'),
        nextText: document.getElementById('qNext').textContent,
      }));
      if (st.fbHidden) {
        await page.evaluate(() => document.getElementById('qNext').click());
      }
      await page.waitForFunction(() => !document.getElementById('qFeedback').classList.contains('hidden'), { timeout: 5000 });
      return await page.evaluate(() => document.getElementById('qFeedback').textContent.replace(/\s+/g, ' ').trim().length > 0);
    }

    const fb1 = await answerOneQuiz();
    ok('第1题出现判分反馈', fb1);
    // 推进到下一题
    await page.evaluate(() => document.getElementById('qNext').click());
    await page.waitForFunction(() =>
      document.querySelectorAll('#qOptions .opt').length > 0 &&
      document.getElementById('qFeedback').classList.contains('hidden'), { timeout: 5000 });
    const fb2 = await answerOneQuiz();
    ok('第2题出现判分反馈', fb2);

    console.log('== 7. 填空视图：题库 81 题 ==');
    await page.evaluate(() => {
      const b = document.querySelector('.mode-btn[data-view="fill"]') || document.querySelector('[data-view="fill"]');
      b.click();
    });
    await page.waitForFunction(() => !document.getElementById('view-fill').classList.contains('hidden'), { timeout: 5000 });
    await sleep(300);
    const fillGrid = await page.evaluate(() => document.querySelectorAll('#fjumpGrid .jump-btn').length);
    const ffRange = await page.evaluate(() => document.getElementById('ffRange').textContent);
    const ffStats = await page.evaluate(() => document.getElementById('ffStats').textContent);
    const fqTextLen = await page.evaluate(() => document.getElementById('fqText').textContent.trim().length);
    ok('#fjumpGrid 跳题格总数 === 81', fillGrid === 81, '实际 ' + fillGrid);
    ok('#ffRange / #ffStats 体现共 81 题', /81/.test(ffRange) || /共 81 题/.test(ffStats), 'range="' + ffRange + '" stats="' + ffStats + '"');
    ok('#fqText 有题目文本', fqTextLen > 0, '长度 ' + fqTextLen);
    // 提交一次（允许答错）：填满输入框再点提交
    await page.evaluate(() => {
      document.querySelectorAll('#fqOptions .fill-input').forEach(i => { i.value = '占位'; });
      document.getElementById('fqNext').click();
    });
    await page.waitForFunction(() => !document.getElementById('fqFeedback').classList.contains('hidden'), { timeout: 5000 });
    ok('填空提交后 #fqFeedback 显示反馈', true);

    console.log('== 8. 模拟考试入口：组卷可用 ==');
    await page.evaluate(() => {
      const b = document.querySelector('.mode-btn[data-view="exam"]') || document.querySelector('[data-view="exam"]');
      b.click();
    });
    await page.waitForFunction(() => !document.getElementById('exConfig').classList.contains('hidden'), { timeout: 5000 });
    await sleep(300);
    const exAvailC = await page.evaluate(() => document.getElementById('exAvailChoice').textContent);
    const exAvailF = await page.evaluate(() => document.getElementById('exAvailFill').textContent);
    ok('#exAvailChoice === 216', exAvailC === '216', '实际 ' + exAvailC);
    ok('#exAvailFill === 81', exAvailF === '81', '实际 ' + exAvailF);

    await page.evaluate(() => {
      document.getElementById('exFillCount').value = '0';
      document.getElementById('exQuizCount').value = '5';
      document.getElementById('exDuration').value = '5';
    });
    await page.click('#exStart');
    await page.waitForFunction(() => !document.getElementById('exRunning').classList.contains('hidden'), { timeout: 5000 });
    await sleep(300);
    const exQText = await page.evaluate(() => document.getElementById('exQText').textContent.trim());
    const exJumpCount = await page.evaluate(() => document.querySelectorAll('#exJumpGrid .jump-btn').length);
    ok('考试开始（进入 exRunning 且渲染题目）', exQText.length > 0 && exJumpCount === 5,
      '题目长度=' + exQText.length + ' 跳题格=' + exJumpCount);
    // 不强行退出；断言考题渲染即视为入口/组卷可用
  } catch (e) {
    fail++;
    console.error('脚本异常：', e);
  } finally {
    console.log('  [导航日志] ' + JSON.stringify(navs));
    await browser.close();
  }

  console.log('');
  console.log('nbt11773 v11 真浏览器验证结果：' + pass + ' 通过 / ' + fail + ' 失败');
  if (fails.length) { console.log('失败项：'); fails.forEach(f => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('脚本顶层异常：', e); process.exit(2); });
