/* nbt10991 模拟考试模块 · 真浏览器只读验证（Edge + puppeteer-core）
   覆盖：题库接入断言 / 组卷 / 随机性 / 单章过滤 / 边界钳制 / 判分（含填空变体归一化）/
         成绩存储结构 / 账号隔离 / 截图（config/running/result + 既有答题视图对比）
   不修改 index.html / app.js / style.css / data/ 下任何共享文件。 */
'use strict';
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'http://127.0.0.1:8765/index.html';
const SHOT = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SHOT)) fs.mkdirSync(SHOT, { recursive: true });

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); fails.push(name + (extra ? '  → ' + extra : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('dialog', async d => { await d.accept(); });

  // ---------- 注册账号 01 并进入 nbt10991 ----------
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  const clearReg = async () => {
    await page.evaluate(() => { ['rgUser', 'rgNick', 'rgPass', 'rgPass2'].forEach(id => { const e = document.getElementById(id); e.value = ''; }); });
  };
  await page.click('#tabReg');
  await clearReg();
  await page.type('#rgUser', 'verify_nbt991_01');
  await page.type('#rgNick', '验证员01');
  await page.type('#rgPass', 'verify123');
  await page.type('#rgPass2', 'verify123');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {}), page.click('#formReg .auth-btn')]);
  await page.waitForSelector('.portal-card', { timeout: 10000 });
  ok('账号01 注册并进入门户', true);
  // nbt10991 是第 3 张卡片（gbt46154 / nbt11773 / nbt10991）
  await page.evaluate(() => document.querySelectorAll('.portal-card')[2].querySelector('.pc-btn').click());
  await page.waitForFunction(() => document.getElementById('lecTitle').textContent !== '正在加载课程数据…', { timeout: 20000 });
  ok('进入 nbt10991 课程', await page.evaluate(() => /塔架升降机/.test(document.getElementById('courseTitle').textContent)));
  ok('nbt10991 章节数=14', await page.evaluate(() => document.querySelectorAll('#chapNav .chap-item').length === 14));

  // 建立题库查找表（浏览器侧，用于回查正确答案）
  await page.evaluate(() => {
    window.__LK = { choice: {}, fill: {} };
    for (let i = 1; i <= 14; i++) {
      const k = 'CH' + (i < 10 ? '0' + i : i);
      const c = window[k]; if (!c) continue;
      c.questions.forEach(q => { window.__LK.choice[q.q] = q; });
    }
    window.FILL.questions.forEach(q => { window.__LK.fill[q.q] = q; });
  });

  // ---------- 2. 进入模拟考试 ----------
  console.log('== 2. 组卷试运行 ==');
  await page.evaluate(() => document.querySelector('.mode-btn[data-view="exam"]').click());
  await sleep(300);
  ok('点击「模拟考试」后配置面板出现', await page.evaluate(() => !document.getElementById('exConfig').classList.contains('hidden')));
  ok('选择题可用题量=198', await page.evaluate(() => document.getElementById('exAvailChoice').textContent === '198'), await page.evaluate(() => document.getElementById('exAvailChoice').textContent));
  ok('填空题可用题量=85', await page.evaluate(() => document.getElementById('exAvailFill').textContent === '85'), await page.evaluate(() => document.getElementById('exAvailFill').textContent));
  ok('章节下拉=全部+14章（15项）', await page.evaluate(() => document.getElementById('exChapter').options.length === 15));
  await page.screenshot({ path: path.join(SHOT, 'verify_nbt10991_config.png') });
  console.log('  📷 配置面板截图已保存');

  // 配置：选择10 + 填空3 + 全部章节 + 10分钟
  await page.evaluate(() => {
    document.getElementById('exChapter').value = 'all';
    document.getElementById('exQuizCount').value = 10;
    document.getElementById('exFillCount').value = 3;
    document.getElementById('exDuration').value = 10;
    document.getElementById('exStart').click();
  });
  await page.waitForSelector('#exQText', { timeout: 5000 });
  await sleep(300);
  const btnCount = await page.evaluate(() => document.querySelectorAll('#exJumpGrid .jump-btn').length);
  ok('共 13 题（10选择+3填空）', btnCount === 13, '实际 ' + btnCount);
  ok('初始倒计时 10:00', await page.evaluate(() => document.getElementById('exTimer').textContent === '10:00'), await page.evaluate(() => document.getElementById('exTimer').textContent));
  ok('进度显示 第1/共13题', await page.evaluate(() => /第 1 \/ 共 13 题/.test(document.getElementById('exProgress').textContent)), await page.evaluate(() => document.getElementById('exProgress').textContent));
  // 倒计时走动
  const t1 = await page.evaluate(() => document.getElementById('exTimer').textContent);
  await sleep(2200);
  const t2 = await page.evaluate(() => document.getElementById('exTimer').textContent);
  ok('倒计时走动（' + t1 + ' → ' + t2 + '）', t1 !== t2);
  // 题号连续 & 选择在前填空在后
  const nums = await page.evaluate(() => Array.from(document.querySelectorAll('#exJumpGrid .jump-btn')).map(b => b.textContent));
  ok('题号 1~13 连续', nums.join(',') === '1,2,3,4,5,6,7,8,9,10,11,12,13', nums.join(','));

  // 干扫：确认本张卷子含 单/多/判断 三种选择题型；缺多选则重抽（题库仅13道多选，随机10道可能抽不到）
  async function gradingPaperTypes() {
    const seen = { single: false, multi: false, judge: false };
    for (let i = 0; i < 10; i++) {
      await page.evaluate(i => document.querySelectorAll('#exJumpGrid .jump-btn')[i].click(), i);
      await sleep(60);
      const txt = await page.evaluate(() => document.getElementById('exQText').textContent);
      const q = await page.evaluate(t => window.__LK.choice[t], txt);
      if (q && seen.hasOwnProperty(q.t)) seen[q.t] = true;
    }
    return seen;
  }
  let typesSeenNow = await gradingPaperTypes();
  let attempt = 0;
  while ((!typesSeenNow.multi || !typesSeenNow.single || !typesSeenNow.judge) && attempt < 6) {
    attempt++;
    console.log('  · 本张卷子缺多选，重抽第 ' + attempt + ' 次');
    await page.click('#exSubmit'); await sleep(300);          // 弃用该卷
    await page.evaluate(() => document.getElementById('exRetry').click()); await sleep(200);
    await page.evaluate(() => {
      document.getElementById('exChapter').value = 'all';
      document.getElementById('exQuizCount').value = 10;
      document.getElementById('exFillCount').value = 3;
      document.getElementById('exDuration').value = 10;
      document.getElementById('exStart').click();
    });
    await page.waitForSelector('#exQText', { timeout: 5000 });
    await sleep(150);
    typesSeenNow = await gradingPaperTypes();
  }
  ok('组卷含单/多/判断三种题型（重抽' + attempt + '次后）', typesSeenNow.single && typesSeenNow.multi && typesSeenNow.judge, JSON.stringify(typesSeenNow));

  // ---------- 3. 逐题作答（一遍走完，同时验证选择在前填空在后） ----------
  console.log('== 3. 判分抽查 ==');
  // 期望：选择 9 对 1 错；填空 2 对 1 错；变体填空判对
  const expected = []; // 每项 {idx, type, ok}
  let choiceN = 0;       // 选择题序号：第2道故意答错，其余答对 → 9对1错
  const typeSeen = { single: false, multi: false, judge: false };
  let variantFillIdx = -1;
  let fillNo = 0;
  const jumpTo = (idx) => page.evaluate(i => document.querySelectorAll('#exJumpGrid .jump-btn')[i].click(), idx);

  for (let i = 0; i < 13; i++) {
    await jumpTo(i);
    await sleep(80);
    const qtype = await page.evaluate(() => document.getElementById('exQType').textContent);
    const qtext = await page.evaluate(() => document.getElementById('exQText').textContent);
    if (qtype === '填空题') {
      fillNo++;
      const fq = await page.evaluate(t => window.__LK.fill[t], qtext);
      if (!fq) { ok('填空题可回查题库 #' + (i + 1), false); continue; }
      const inputs = await page.$$('#exQOptions .fill-input');
      // 决定本题答案
      let userAns, okFlag;
      if (fillNo === 1) {
        // 变体：优先找有多可接受答案的空，用第二可接受答案 + 空白大小写变体
        userAns = fq.a.map(acc => {
          const base = acc.length > 1 ? acc[acc.length - 1] : acc[0];
          // 变体：首尾加空格 + 字母大写（normIn 应归一化判对）
          return '  ' + base.toUpperCase() + '  ';
        });
        okFlag = true;
        variantFillIdx = i;
      } else if (fillNo === 2) {
        userAns = fq.a.map(acc => acc[0]);
        okFlag = true;
      } else {
        userAns = fq.a.map(() => '错误答案XYZ');
        okFlag = false;
      }
      for (let k = 0; k < inputs.length; k++) { await inputs[k].type(userAns[k]); await sleep(20); }
      expected.push({ idx: i, type: 'fill', ok: okFlag });
    } else {
      const q = await page.evaluate(t => window.__LK.choice[t], qtext);
      if (!q) { ok('选择题可回查题库 #' + (i + 1), false); continue; }
      const tkey = q.t; // single/multi/judge
      typeSeen[tkey] = true;
      choiceN++;
      // 决定对错：第 2 道选择故意答错，其余答对 → 选择 9 对 1 错
      let pick, okFlag;
      if (choiceN === 2) {
        const optsN = q.t === 'judge' ? 2 : q.o.length;
        let bad = -1;
        for (let x = 0; x < optsN; x++) { if (q.a.indexOf(x) < 0) { bad = x; break; } }
        pick = [bad >= 0 ? bad : (q.a[0] === 0 ? 1 : 0)];
        okFlag = false;
      } else {
        pick = q.a.slice(); okFlag = true;
      }
      // 点击对应选项
      await page.evaluate((pickArr) => {
        const opts = document.querySelectorAll('#exQOptions .opt');
        pickArr.forEach(pi => opts[pi].click());
      }, pick);
      await sleep(60);
      expected.push({ idx: i, type: 'choice', ok: okFlag, subtype: tkey });
    }
  }
  ok('试卷前 10 题为选择题、后 3 题为填空题', expected.slice(0, 10).every(e => e.type === 'choice') && expected.slice(10).every(e => e.type === 'fill'), JSON.stringify(expected.map(e => e.type)));
  ok('覆盖三种选择题型（单/多/判断各≥1）', typeSeen.single && typeSeen.multi && typeSeen.judge, JSON.stringify(typeSeen));
  const rightCnt = expected.filter(e => e.ok).length;
  ok('本次作答：对 ' + rightCnt + ' 错 ' + (13 - rightCnt) + '（设计为 11/2）', rightCnt === 11, '实际 ' + rightCnt);

  // 截图 running（在已作答状态）
  await page.screenshot({ path: path.join(SHOT, 'verify_nbt10991_running.png') });
  console.log('  📷 考试中截图已保存');

  // 交卷
  await page.click('#exSubmit');
  await sleep(400);
  ok('交卷后结果页可见', await page.evaluate(() => !document.getElementById('exResult').classList.contains('hidden')));
  const score = await page.evaluate(() => document.querySelector('#exResultCards .scard b').textContent);
  const rightTotal = await page.evaluate(() => document.querySelectorAll('#exResultCards .scard')[1].textContent);
  const detailCount = await page.evaluate(() => document.querySelectorAll('#exDetailList .ex-detail').length);
  ok('结果页总分=85（11/13）', score === '85', '实际 ' + score);
  ok('结果页答对/总=11/13', /11\s*\/\s*13/.test(rightTotal), rightTotal);
  ok('逐题详情 13 条', detailCount === 13, '实际 ' + detailCount);
  await page.screenshot({ path: path.join(SHOT, 'verify_nbt10991_result.png') });
  console.log('  📷 结果页截图已保存');

  // 对照逐题对错
  const details = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#exDetailList .ex-detail')).map(d => ({
      ok: d.classList.contains('ok'),
      flag: d.querySelector('.xd-flag') ? d.querySelector('.xd-flag').textContent.trim() : ''
    }));
  });
  let detailMatch = true;
  expected.forEach((e, i) => { if (details[i] && details[i].ok !== e.ok) detailMatch = false; });
  ok('逐题对错与作答意图一致', detailMatch, JSON.stringify(expected.map(e => e.ok)) + ' vs ' + JSON.stringify(details.map(d => d.ok)));
  // 变体填空判对
  const variantOk = details[variantFillIdx] ? details[variantFillIdx].ok : false;
  ok('变体填空（空白/大小写归一化）判为正确', variantOk, '第' + (variantFillIdx + 1) + '题 ok=' + variantOk);

  // ---------- 4. 成绩存储结构 ----------
  console.log('== 4. 成绩存储与隔离 ==');
  const recRaw = await page.evaluate(() => localStorage.getItem('unified_v1_nbt10991_verify_nbt991_01_exam'));
  ok('成绩键 unified_v1_nbt10991_verify_nbt991_01_exam 存在', !!recRaw);
  if (recRaw) {
    const arr = JSON.parse(recRaw);
    const r = arr[arr.length - 1];
    ok('成绩记录结构完整（id/at/total/right/score/durationSec/config/details）',
      typeof r.id === 'number' && typeof r.at === 'number' && r.total === 13 &&
      r.right === 11 && r.score === 85 && typeof r.durationSec === 'number' &&
      r.config && Array.isArray(r.details) && r.details.length === 13);
    ok('details 每条含 ok/userAns/correctAns', r.details.every(x => typeof x.ok === 'boolean' && x.userAns && x.correctAns));
  }

  // ---------- 随机性：两次组卷题目不同 ----------
  console.log('== 2b. 随机性 / 单章过滤 / 边界钳制 ==');
  async function startPaper(nC, nF, chVal, dur) {
    await page.evaluate(() => document.getElementById('exRetry').click());
    await sleep(200);
    await page.evaluate((c, cc, ff, du) => {
      document.getElementById('exChapter').value = c;
      document.getElementById('exQuizCount').value = cc;
      document.getElementById('exFillCount').value = ff;
      document.getElementById('exDuration').value = du;
      document.getElementById('exStart').click();
    }, chVal, nC, nF, dur);
    await page.waitForSelector('#exQText', { timeout: 5000 });
    await sleep(150);
  }
  async function collectTexts(n) {
    const texts = [];
    for (let i = 0; i < n; i++) {
      texts.push(await page.evaluate(() => document.getElementById('exQText').textContent));
      if (i + 1 < n) await page.evaluate(i => document.querySelectorAll('#exJumpGrid .jump-btn')[i + 1].click(), i);
      await sleep(40);
    }
    return texts;
  }
  await startPaper(10, 0, 'all', 5);
  const run1 = await collectTexts(10);
  await page.click('#exSubmit'); await sleep(300);
  await startPaper(10, 0, 'all', 5);
  const run2 = await collectTexts(10);
  const same = run1.length === run2.length && run1.every((t, i) => t === run2[i]);
  ok('两次组卷题目序列不完全相同（随机性）', !same, same ? '两次完全一致' : '已不同');
  await page.click('#exSubmit'); await sleep(300);

  // 单章过滤：第7章，5道选择
  await startPaper(5, 0, '7', 5);
  const ch7tags = [];
  for (let i = 0; i < 5; i++) {
    ch7tags.push(await page.evaluate(() => document.getElementById('exQChapter').textContent));
    if (i + 1 < 5) await page.evaluate(i => document.querySelectorAll('#exJumpGrid .jump-btn')[i + 1].click(), i);
    await sleep(30);
  }
  ok('单章第7章组卷 5 题全部来自第7章', ch7tags.every(t => /第7章/.test(t)), ch7tags.join(' | '));
  await page.click('#exSubmit'); await sleep(300);

  // 边界：999 被钳制（选择≤100、填空≤50，共150）
  await startPaper(999, 999, 'all', 5);
  const clamped = await page.evaluate(() => document.querySelectorAll('#exJumpGrid .jump-btn').length);
  ok('题量999被钳制为150（选择100+填空50）', clamped === 150, '实际 ' + clamped);
  await page.click('#exSubmit'); await sleep(300);

  // ---------- 账号隔离 ----------
  await page.evaluate(() => document.getElementById('btnBackPortal').click());
  await sleep(300);
  await page.evaluate(() => document.getElementById('btnLogout2').click());
  await sleep(300);
  await page.click('#tabReg');
  await clearReg();
  await page.type('#rgUser', 'verify_nbt991_02');
  await page.type('#rgNick', '验证员02');
  await page.type('#rgPass', 'verify123');
  await page.type('#rgPass2', 'verify123');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {}), page.click('#formReg .auth-btn')]);
  await page.waitForSelector('.portal-card', { timeout: 10000 });
  await page.evaluate(() => document.querySelectorAll('.portal-card')[2].querySelector('.pc-btn').click());
  await page.waitForFunction(() => document.getElementById('lecTitle').textContent !== '正在加载课程数据…', { timeout: 20000 });
  ok('账号02 课程顶栏显示「验证员02」', await page.evaluate(() => document.getElementById('courseBarUser').textContent === '验证员02'),
    await page.evaluate(() => document.getElementById('courseBarUser').textContent));
  await page.evaluate(() => document.querySelector('.mode-btn[data-view="exam"]').click());
  await sleep(300);
  await page.evaluate(() => document.getElementById('exHistory').click());
  await sleep(200);
  const histEmpty = await page.evaluate(() => /还没有模拟考试记录/.test(document.getElementById('examHistBody').textContent));
  ok('账号02 历史成绩为空（隔离）', histEmpty);
  const key02 = await page.evaluate(() => localStorage.getItem('unified_v1_nbt10991_verify_nbt991_02_exam'));
  ok('账号02 exam 存储键不存在', !key02);
  await page.evaluate(() => document.getElementById('examHistClose').click());

  // ---------- 5. 既有答题视图截图对比 ----------
  console.log('== 5. 界面风格截图 ==');
  await page.evaluate(() => document.querySelector('.mode-btn[data-view="quiz"]').click());
  await page.waitForSelector('#qOptions .opt', { timeout: 5000 });
  await sleep(400);
  await page.screenshot({ path: path.join(SHOT, 'verify_nbt10991_quizview.png') });
  console.log('  📷 既有答题视图截图已保存（风格对比用）');

  console.log('');
  console.log('真浏览器验证结果：' + pass + ' 通过 / ' + fail + ' 失败');
  if (fail) { console.log('失败项：'); fails.forEach(f => console.log('   - ' + f)); }
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('脚本异常：', e); process.exit(2); });
