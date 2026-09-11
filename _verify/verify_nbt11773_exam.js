/* nbt11773 模拟考试模块 · Edge 真浏览器只读验证（puppeteer-core）
   覆盖：组卷配置/题量/顺序/计时/随机/章节筛选/边界钳制、判分(选择+填空变体)、
         成绩存储键与账号隔离、配置/进行/结果三视图截图 + 答题视图风格对比 */
'use strict';
const puppeteer = require('puppeteer-core');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const URL = 'http://127.0.0.1:8765/index.html';
const SHOT = 'D:/学习/体系文件/统一学习平台/_verify/screenshots';

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); fails.push(name + (extra ? ' :: ' + extra : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const $id = id => 'document.getElementById("' + id + '")';
// 数值化翻页（避免字符串比较 "2"<"13" 为 false 的坑）
async function goNext(page) {
  await page.evaluate(() => {
    const parts = document.getElementById('exQIdx').textContent.split(' / ');
    const cur = parseInt(parts[0], 10), total = parseInt(parts[1], 10);
    if (cur < total) document.getElementById('exNext').click();
  });
  await sleep(80);
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  page.on('dialog', async d => { await d.accept(); });

  // ---- 注册/登录并进入 nbt11773（门户第2张卡片 index=1）----
  async function regEnter(uname, nick, courseIdx) {
    await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.click('#tabReg');
    await page.type('#rgUser', uname);
    await page.type('#rgNick', nick);
    await page.type('#rgPass', 'test1234');
    await page.type('#rgPass2', 'test1234');
    await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {}), page.click('#formReg .auth-btn')]);
    await page.waitForSelector('.portal-card', { timeout: 10000 });
    await page.evaluate(idx => document.querySelectorAll('.portal-card')[idx].querySelector('.pc-btn').click(), courseIdx);
    await page.waitForFunction(() => document.getElementById('lecTitle').textContent !== '正在加载课程数据…', { timeout: 20000 });
  }
  async function gotoExam() {
    await page.evaluate(() => document.querySelector('.mode-btn[data-view="exam"]').click());
    await sleep(300);
  }
  // 配置并开始考试
  async function startPaper(opt) {
    // 确保在配置面板
    if (!await page.evaluate(() => !document.getElementById('exConfig').classList.contains('hidden'))) {
      await page.evaluate(() => document.getElementById('exRetry').click());
      await sleep(200);
    }
    await page.select('#exChapter', opt.ch || 'all');
    await page.evaluate((qc, fc, dur) => {
      document.getElementById('exQuizCount').value = qc;
      document.getElementById('exFillCount').value = fc;
      document.getElementById('exDuration').value = dur;
    }, opt.nC, opt.nF, opt.dur);
    await page.click('#exStart');
    await sleep(200);
  }
  async function submitPaper() {
    await page.evaluate(() => document.getElementById('exSubmit').click());
    await sleep(300);
  }
  // 读取当前题的题型/章节/题干
  async function curQuestion() {
    return await page.evaluate(() => ({
      type: document.getElementById('exQType').textContent,
      chapter: document.getElementById('exQChapter').textContent,
      text: document.getElementById('exQText').textContent,
      idx: document.getElementById('exQIdx').textContent
    }));
  }
  // 在题库中定位选择题答案
  async function lookupChoice(stem) {
    return await page.evaluate(s => {
      for (let i = 1; i <= 9; i++) {
        const ch = window['CH' + (i < 10 ? '0' + i : i)];
        if (!ch) continue;
        const q = ch.questions.find(x => x.q === s);
        if (q) return { t: q.t, a: q.a, nOpt: q.t === 'judge' ? 2 : q.o.length };
      }
      return null;
    }, stem);
  }
  async function lookupFill(stem) {
    return await page.evaluate(s => (window.FILL.questions.find(x => x.q === s) || null), stem);
  }

  console.log('== 登录并进入 nbt11773 课程 ==');
  await regEnter('verify_nbt773_01', '验证员甲', 1);
  ok('进入课程后总题量=216', await page.evaluate(() => document.getElementById('totalCount').textContent === '216'), await page.evaluate(() => document.getElementById('totalCount').textContent));
  ok('课程章节数=9', await page.evaluate(() => document.querySelectorAll('#chapNav .chap-item').length === 9), await page.evaluate(() => document.querySelectorAll('#chapNav .chap-item').length));

  await gotoExam();
  console.log('== 2. 组卷试运行 ==');
  ok('点击模拟考试后配置面板可见', await page.evaluate(() => !document.getElementById('exConfig').classList.contains('hidden')));
  ok('选择题可用上限显示 216', await page.evaluate(() => document.getElementById('exAvailChoice').textContent === '216'), await page.evaluate(() => document.getElementById('exAvailChoice').textContent));
  ok('填空题可用上限显示 81', await page.evaluate(() => document.getElementById('exAvailFill').textContent === '81'), await page.evaluate(() => document.getElementById('exAvailFill').textContent));
  ok('章节下拉=全部+9章(共10项)', await page.evaluate(() => document.getElementById('exChapter').options.length === 10), await page.evaluate(() => document.getElementById('exChapter').options.length));
  await page.screenshot({ path: SHOT + '/verify_nbt11773_config.png' });

  // --- 试卷A：10 选择 + 3 填空，全部章节，10 分钟 ---
  await startPaper({ nC: 10, nF: 3, dur: 10, ch: 'all' });
  ok('开始后进入考试界面', await page.evaluate(() => !document.getElementById('exRunning').classList.contains('hidden')));
  const jumpCount = await page.evaluate(() => document.querySelectorAll('#exJumpGrid .jump-btn').length);
  ok('试卷共 13 题', jumpCount === 13, '实际 ' + jumpCount);
  // 题号连续
  const nums = await page.evaluate(() => Array.from(document.querySelectorAll('#exJumpGrid .jump-btn')).map(b => b.textContent));
  ok('题号连续 1~13', nums.join(',') === Array.from({length:13},(_,i)=>i+1).join(','), nums.join(','));
  // 选择题在前、填空在后
  const order = [];
  for (let i = 0; i < 13; i++) { order.push((await curQuestion()).type); await goNext(page); await sleep(80); }
  const choiceCnt = order.filter(t => t !== '填空题').length;
  const fillCnt = order.filter(t => t === '填空题').length;
  ok('选择题在前(10道)、填空在后(3道)', choiceCnt === 10 && fillCnt === 3 && order.indexOf('填空题') >= 10, JSON.stringify(order));
  // 倒计时
  await page.evaluate(() => document.getElementById('exQIdx') && (document.getElementById('exQIdx').textContent.split(' / ')[0] > 1 ? document.getElementById('exPrev').click() : 0));
  await sleep(150);
  const t1 = await page.evaluate(() => document.getElementById('exTimer').textContent);
  await sleep(1300);
  const t2 = await page.evaluate(() => document.getElementById('exTimer').textContent);
  ok('倒计时正常走动', t1 !== t2, t1 + ' -> ' + t2);
  // 收集试卷A题干签名
  async function collectStems(n) {
    const stems = [];
    for (let i = 0; i < n; i++) { stems.push((await curQuestion()).text); await goNext(page); await sleep(60); }
    return stems;
  }
  // 回到第1题
  await page.evaluate(() => document.querySelector('#exJumpGrid .jump-btn').click());
  await sleep(100);
  const sigA = await collectStems(13);
  await submitPaper();

  // --- 随机性：同配置再组卷 ---
  await page.evaluate(() => document.getElementById('exRetry').click());
  await sleep(200);
  await startPaper({ nC: 10, nF: 3, dur: 10, ch: 'all' });
  const sigB = await collectStems(13);
  const samePaper = sigA.length === sigB.length && sigA.every((t, i) => t === sigB[i]);
  ok('两次组卷题目不完全相同（随机性）', !samePaper, samePaper ? '两次完全一致' : '已不同');
  await submitPaper();

  // --- 章节筛选：第4章，选择5道 ---
  await page.evaluate(() => document.getElementById('exRetry').click());
  await sleep(200);
  await startPaper({ nC: 5, nF: 0, dur: 10, ch: '4' });
  ok('第4章卷进入考试', await page.evaluate(() => !document.getElementById('exRunning').classList.contains('hidden')));
  let allFromCh4 = true;
  for (let i = 0; i < 5; i++) {
    const c = await curQuestion();
    if (!/第4章/.test(c.chapter)) allFromCh4 = false;
    await goNext(page);
    await sleep(60);
  }
  ok('单章(第4章)组卷全部来自第4章', allFromCh4);
  await submitPaper();

  // --- 边界：选择999 / 填空999 被钳制 ---
  await page.evaluate(() => document.getElementById('exRetry').click());
  await sleep(200);
  await startPaper({ nC: 999, nF: 999, dur: 10, ch: 'all' });
  const clamped = await page.evaluate(() => document.querySelectorAll('#exJumpGrid .jump-btn').length);
  ok('题量999被钳制(选择≤100+填空≤50=150)', clamped === 150, '实际 ' + clamped);
  await submitPaper();

  console.log('== 3. 判分抽查 ==');
  // G1：第8章全量选择(18道)，覆盖单/多/判断；故意错1道单选
  await page.evaluate(() => document.getElementById('exRetry').click());
  await sleep(200);
  await startPaper({ nC: 100, nF: 0, dur: 10, ch: '8' });
  const g1Total = await page.evaluate(() => document.querySelectorAll('#exJumpGrid .jump-btn').length);
  ok('G1 第8章全量组卷题数=18', g1Total === 18, '实际 ' + g1Total);
  let rightChoice = 0, wrongChoice = 0, madeWrong = false;
  const typesSeen = {};
  for (let i = 0; i < g1Total; i++) {
    const c = await curQuestion();
    const ans = await lookupChoice(c.text);
    if (!ans) { console.log('  [warn] 未定位题目: ' + c.text.slice(0, 30)); }
    typesSeen[ans ? ans.t : '?'] = true;
    // 截图：进行中（第3题时）
    if (i === 2) await page.screenshot({ path: SHOT + '/verify_nbt11773_running.png' });
    // 决定作答
    const optCount = await page.evaluate(() => document.querySelectorAll('#exQOptions .opt').length);
    if (ans) {
      if (!madeWrong && ans.t === 'single') {
        // 故意选错：选一个不在答案中的选项
        let wrongIdx = (ans.a[0] + 1) % optCount;
        await page.evaluate(idx => document.querySelectorAll('#exQOptions .opt')[idx].click(), wrongIdx);
        madeWrong = true; wrongChoice++;
      } else {
        for (const ai of ans.a) await page.evaluate(idx => document.querySelectorAll('#exQOptions .opt')[idx].click(), ai);
        rightChoice++;
      }
    }
    // 下一题
    await goNext(page);
    await sleep(60);
  }
  ok('覆盖单选/多选/判断三种题型', typesSeen['single'] && typesSeen['multi'] && typesSeen['judge'], JSON.stringify(Object.keys(typesSeen)));
  ok('选择题作答≥3道且含对错(对' + rightChoice + '/错' + wrongChoice + ')', rightChoice + wrongChoice >= 3 && rightChoice >= 2 && wrongChoice >= 1, '对' + rightChoice + ' 错' + wrongChoice);
  await submitPaper();
  // 校验结果页
  const g1Score = await page.evaluate(() => document.querySelector('#exResultCards .scard b').textContent);
  const expectedG1Score = Math.round(rightChoice / g1Total * 100);
  ok('G1 总分计算正确(' + rightChoice + '/' + g1Total + '=' + expectedG1Score + ')', parseInt(g1Score) === expectedG1Score, '显示 ' + g1Score);
  const detailItems = await page.evaluate(() => Array.from(document.querySelectorAll('#exDetailList .ex-detail')).map(d => d.classList.contains('bad')));
  const badCount = detailItems.filter(b => b).length;
  ok('G1 逐题详情对错标记一致(错' + wrongChoice + '道)', badCount === wrongChoice, '详情错' + badCount + ' vs 预期' + wrongChoice);
  await page.screenshot({ path: SHOT + '/verify_nbt11773_result.png' });

  // G2：填空变体判分（全部章节，2选择+3填空）
  await page.evaluate(() => document.getElementById('exRetry').click());
  await sleep(200);
  await startPaper({ nC: 2, nF: 3, dur: 10, ch: 'all' });
  let g2right = 0;
  let fillAnswered = 0, variantAccepted = false;
  for (let i = 0; i < 5; i++) {
    const c = await curQuestion();
    if (c.type === '填空题') {
      const fq = await lookupFill(c.text);
      if (fq) {
        const inputs = await page.$$('#exQOptions .fill-input');
        // 第一空用规范答案；后续空若为变体测试题则加空格/大小写
        for (let k = 0; k < inputs.length; k++) {
          let v = fq.a[k][0];
          if (fillAnswered === 1) { // 第二道填空：故意加首尾空格+小写（测归一化）
            v = '  ' + v.toLowerCase() + ' ';
          }
          await inputs[k].type(v);
          await sleep(30);
        }
        if (fillAnswered === 1) variantAccepted = true;
        fillAnswered++;
      }
    } else {
      const ans = await lookupChoice(c.text);
      if (ans) for (const ai of ans.a) await page.evaluate(idx => document.querySelectorAll('#exQOptions .opt')[idx].click(), ai);
    }
    await goNext(page);
    await sleep(70);
  }
  ok('G2 至少作答2道填空', fillAnswered >= 2, '实际 ' + fillAnswered);
  await submitPaper();
  // 检查填空变体题被判对：在结果详情里找填空型
  const fillDetails = await page.evaluate(() => Array.from(document.querySelectorAll('#exDetailList .ex-detail')).filter(d => /填空/.test(d.querySelector('.tag.type').textContent)).map(d => ({ bad: d.classList.contains('bad'), user: d.querySelector('.xd-ur').textContent })));
  ok('G2 填空全部判对(变体归一化生效)', fillDetails.length === 3 && fillDetails.every(d => !d.bad), JSON.stringify(fillDetails.map(d => d.bad)));
  const g2Score = await page.evaluate(() => document.querySelector('#exResultCards .scard b').textContent);
  ok('G2 满分100(2选择全对+3填空含变体全对)', parseInt(g2Score) === 100, '显示 ' + g2Score);

  console.log('== 4. 成绩存储与隔离 ==');
  const stored = await page.evaluate(() => localStorage.getItem('unified_v1_nbt11773_verify_nbt773_01_exam'));
  ok('账号01 exam 存储键存在', !!stored);
  if (stored) {
    const arr = JSON.parse(stored);
    ok('成绩记录数组长度>=2(本脚本多次交卷累积)', arr.length >= 2, '实际 ' + arr.length);
    const r = arr[arr.length - 1];
    ok('记录结构完整(score/right/total/durationSec/config/details)', typeof r.score === 'number' && typeof r.right === 'number' && typeof r.total === 'number' && typeof r.durationSec === 'number' && r.config && Array.isArray(r.details), JSON.stringify(Object.keys(r)));
    ok('details 条数=total 且含 ok/userAns/correctAns', r.details.length === r.total && r.details.every(x => typeof x.ok === 'boolean' && x.userAns && x.correctAns), 'len=' + r.details.length + ' total=' + r.total);
  }
  // 退出 -> 新账号
  await page.evaluate(() => document.getElementById('btnBackPortal').click());
  await sleep(200);
  await page.evaluate(() => document.getElementById('btnLogout').click());
  await sleep(200);
  await regEnter('verify_nbt773_02', '验证员乙', 1);
  await gotoExam();
  await page.evaluate(() => document.getElementById('exHistory').click());
  await sleep(200);
  const histEmpty = await page.evaluate(() => /还没有模拟考试记录/.test(document.getElementById('examHistBody').textContent));
  ok('账号02历史成绩为空(隔离)', histEmpty);
  const key2 = await page.evaluate(() => localStorage.getItem('unified_v1_nbt11773_verify_nbt773_02_exam'));
  ok('账号02 exam 键不存在', !key2);
  await page.evaluate(() => document.getElementById('examHistClose').click());
  await sleep(150);

  console.log('== 5. 答题视图风格对比截图 ==');
  await page.evaluate(() => document.querySelector('.mode-btn[data-view="lecture"]').click());
  await sleep(300);
  await page.evaluate(() => document.getElementById('lecToQuiz').click());
  await page.waitForSelector('#qOptions .opt', { timeout: 5000 });
  await sleep(200);
  await page.screenshot({ path: SHOT + '/verify_nbt11773_quizview.png' });
  ok('已截取答题视图对比图', true);

  console.log('');
  console.log('真浏览器验证结果：' + pass + ' 通过 / ' + fail + ' 失败');
  if (fails.length) { console.log('失败项：'); fails.forEach(f => console.log('  - ' + f)); }
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('脚本异常：', e); process.exit(2); });
