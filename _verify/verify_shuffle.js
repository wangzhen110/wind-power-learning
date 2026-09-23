/* 选择题选项每次进入随机乱序 · jsdom 专项验证
   覆盖：
   A. 练习单选：多次渲染同一题出现≥2种顺序；选项集合不变；按 data-o 点正确项判分正确；
      存储 ST.ans[gid]={ok,pick:[原始索引]}；fbAnswer 字母跟随乱序
   B. 练习多选：按 data-o 点全部正确项 -> 判分正确；pick 为原始索引集合
   C. 练习判断：选项恒为 [正确,错误]，多次渲染顺序不变
   D. 练习含图题：乱序重渲染不破坏图片容器
   E. 模拟考试：exRenderQ 乱序 + exPickChoice 选原始索引 + exGradeChoice 判分（5题全对）
*/
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = 'D:/学习/体系文件/统一学习平台';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async function () {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', resources: 'usable',
    url: 'http://127.0.0.1:8765/index.html', pretendToBeVisual: true
  });
  const w = dom.window, d = w.document;
  w.alert = function () {};
  w.confirm = function () { return true; };
  w.scrollTo = function () {};
  const $ = id => d.getElementById(id);
  const fire = (el, ev) => el.dispatchEvent(new w.Event(ev, { bubbles: true, cancelable: true }));
  const wait = async (cond, timeout) => {
    const t0 = Date.now();
    while (!cond()) { if (Date.now() - t0 > timeout) return false; await sleep(50); }
    return true;
  };
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

  // 题库定位：按题干精确匹配
  function findQ(text) {
    for (let i = 1; i <= 14; i++) {
      const k = 'CH' + (i < 10 ? '0' + i : i);
      const ch = w[k]; if (!ch || !ch.questions) continue;
      const q = ch.questions.find(x => x.q === text);
      if (q) return { q, chId: ch.id };
    }
    return null;
  }
  // 预扫描：找一道含图的单选题及其章节
  function findFigureSingle() {
    for (let i = 1; i <= 14; i++) {
      const k = 'CH' + (i < 10 ? '0' + i : i);
      const ch = w[k]; if (!ch || !ch.questions) continue;
      const q = ch.questions.find(x => x.t === 'single' && x.figs && x.figs.length);
      if (q) return { q, chId: ch.id };
    }
    return null;
  }
  // 读当前练习选项：{o:原始索引, letter, text}
  function readOpts() {
    return Array.from(d.querySelectorAll('#qOptions .opt')).map(el => ({
      o: parseInt(el.getAttribute('data-o'), 10),
      letter: el.querySelector('.letter') ? el.querySelector('.letter').textContent : '',
      text: (el.children && el.children[1]) ? el.children[1].textContent.trim() : el.textContent.trim()
    }));
  }
  function rerenderQuiz() { const c = d.querySelector('#jumpGrid .cur'); if (c) c.click(); }
  function setQuizFilter(ch, type) {
    $('fChapter').value = ch;
    $('fType').value = type;
    $('fScope').value = 'all';
    fire($('fType'), 'change');
  }
  // 在当前题点击所有正确项（按 data-o 匹配原始索引），返回点击的节点
  function clickCorrectPractice(q) {
    const els = Array.from(d.querySelectorAll('#qOptions .opt'));
    const clicked = [];
    els.forEach(el => {
      const o = parseInt(el.getAttribute('data-o'), 10);
      if (q.a.indexOf(o) >= 0) { el.click(); clicked.push(el); }
    });
    return clicked;
  }

  console.log('== 0. 注册账号并进入 gbt46154 课程 ==');
  await sleep(300);
  $('tabReg').click();
  $('rgUser').value = 'shuffleuser1'; $('rgNick').value = 'su1';
  $('rgPass').value = '1234'; $('rgPass2').value = '1234';
  fire($('formReg'), 'submit');
  await sleep(300);
  d.querySelectorAll('.portal-card')[0].querySelector('.pc-btn').click();
  await wait(() => $('lecTitle').textContent !== '正在加载课程数据…', 15000);
  ok('进入课程成功', $('lecTitle').textContent.length > 0);

  // 进入练习（答题）模式
  d.querySelector('.mode-btn[data-view="quiz"]').click();
  await sleep(200);
  ok('答题视图可见', !$('view-quiz').classList.contains('hidden'));

  console.log('== A. 单选题乱序 + 判分 + 存储结构 ==');
  setQuizFilter('all', 'single');
  await sleep(150);
  ok('单选题池非空', $('qType').textContent === '单选题', $('qType').textContent);
  const sigSet = new Set();
  let multisetOk = true, nOpt = 0;
  for (let r = 0; r < 12; r++) {
    const opts = readOpts();
    nOpt = opts.length;
    const seq = opts.map(o => o.o).join(',');
    sigSet.add(seq);
    const sorted = opts.map(o => o.o).slice().sort((a, b) => a - b).join(',');
    const expect = opts.map((_, i) => i).join(',');
    if (sorted !== expect) multisetOk = false;
    rerenderQuiz();
    await sleep(30);
  }
  ok('12次渲染出现≥2种不同选项顺序', sigSet.size >= 2, 'distinct=' + sigSet.size);
  ok('每次渲染 data-o 都是完整排列（集合不变）', multisetOk && nOpt > 1);

  // 判分：按 data-o 点正确项
  const curQText = $('qText').textContent;
  const found = findQ(curQText);
  ok('当前单选题可在题库定位', !!found);
  if (found) {
    const correctEl = Array.from(d.querySelectorAll('#qOptions .opt'))
      .find(el => parseInt(el.getAttribute('data-o'), 10) === found.q.a[0]);
    ok('能通过 data-o 找到正确选项节点', !!correctEl);
    const letterBefore = correctEl ? correctEl.querySelector('.letter').textContent : '';
    correctEl.click();
    await sleep(100);
    ok('单选答对后出现正确反馈', /回答正确/.test($('fbHead').textContent) && !/回答错误/.test($('fbHead').textContent), $('fbHead').textContent);
    ok('正确选项节点加 right 类', correctEl.classList.contains('right'));
    // fbAnswer 字母跟随乱序
    const fbLetterMatch = $('fbAnswer').textContent.match(/^([A-F])\./);
    ok('fbAnswer 字母等于当前乱序下正确项的字母', !!fbLetterMatch && fbLetterMatch[1] === letterBefore,
      'fb=' + (fbLetterMatch && fbLetterMatch[1]) + ' letter=' + letterBefore);
    // 存储结构
    const raw = w.localStorage.getItem('unified_v1_gbt46154_shuffleuser1_quiz');
    ok('练习存储键存在', !!raw);
    if (raw) {
      const st = JSON.parse(raw);
      const keys = Object.keys(st.ans);
      ok('ST.ans 至少有1条记录', keys.length >= 1, 'keys=' + keys.length);
      const entry = st.ans[keys[0]];
      ok('记录结构 {ok:boolean, pick:array}',
        typeof entry.ok === 'boolean' && Array.isArray(entry.pick), JSON.stringify(entry));
      ok('pick 存原始索引且等于 [a[0]]',
        entry.pick.length === 1 && entry.pick[0] === found.q.a[0], JSON.stringify(entry.pick));
    }
  }

  console.log('== B. 多选题乱序判分 + pick 原始索引集合 ==');
  setQuizFilter('all', 'multi');
  await sleep(150);
  ok('多选题池非空', $('qType').textContent === '多选题', $('qType').textContent);
  const mFound = findQ($('qText').textContent);
  ok('当前多选题可在题库定位', !!mFound);
  if (mFound) {
    const clicked = clickCorrectPractice(mFound.q);
    await sleep(80);
    ok('按 data-o 点中全部正确项', clicked.length === mFound.q.a.length,
      'clicked=' + clicked.length + ' expect=' + mFound.q.a.length);
    $('qNext').click(); // 提交多选
    await sleep(100);
    ok('多选答对后出现正确反馈', /回答正确/.test($('fbHead').textContent), $('fbHead').textContent);
    const raw2 = w.localStorage.getItem('unified_v1_gbt46154_shuffleuser1_quiz');
    if (raw2) {
      const st2 = JSON.parse(raw2);
      const lastKey = Object.keys(st2.ans).pop();
      const e2 = st2.ans[lastKey];
      const pickSorted = e2.pick.slice().sort((a, b) => a - b).join(',');
      const ansSorted = mFound.q.a.slice().sort((a, b) => a - b).join(',');
      ok('多选 pick 为原始索引集合（与 q.a 一致）', e2.ok === true && pickSorted === ansSorted,
        'pick=' + e2.pick + ' a=' + mFound.q.a);
    }
  }

  console.log('== C. 判断题选项恒为 [正确,错误]，多次渲染不变 ==');
  setQuizFilter('all', 'judge');
  await sleep(150);
  ok('判断题池非空', $('qType').textContent === '判断题', $('qType').textContent);
  let judgeOrderConst = true, firstTexts = null;
  for (let r = 0; r < 6; r++) {
    const opts = readOpts();
    const texts = opts.map(o => o.text);
    const os = opts.map(o => o.o).join(',');
    if (r === 0) { firstTexts = texts; }
    else {
      if (texts[0] !== firstTexts[0] || texts[1] !== firstTexts[1]) judgeOrderConst = false;
    }
    if (texts[0] !== '正确' || texts[1] !== '错误' || os !== '0,1') judgeOrderConst = false;
    rerenderQuiz();
    await sleep(30);
  }
  ok('判断题选项恒为 [正确,错误] 且 data-o=0,1', judgeOrderConst, JSON.stringify(firstTexts));

  console.log('== D. 含图单选题乱序重渲染不破坏图片容器 ==');
  const figTarget = findFigureSingle();
  ok('题库中存在含图单选题', !!figTarget);
  if (figTarget) {
    setQuizFilter(String(figTarget.chId), 'single');
    await sleep(150);
    // 在该章节单选题里找到含图那一道
    let foundFig = false;
    for (let step = 0; step < 40; step++) {
      const img = d.querySelector('#qOptions').parentNode.querySelector('.q-fig-wrap .q-fig') ||
        d.querySelector('.q-fig-wrap .q-fig');
      if ($('qText').textContent === figTarget.q.q) { foundFig = true; break; }
      $('qNext').click();
      await sleep(40);
    }
    ok('导航到目标含图单选题', foundFig, $('qText').textContent.slice(0, 20));
    if (foundFig) {
      const img1 = d.querySelector('.q-fig-wrap .q-fig');
      const src1 = img1 ? img1.getAttribute('src') : null;
      ok('首次渲染存在图片', !!img1 && !!src1, src1 || '');
      rerenderQuiz();
      await sleep(80);
      const img2 = d.querySelector('.q-fig-wrap .q-fig');
      const src2 = img2 ? img2.getAttribute('src') : null;
      ok('乱序重渲染后图片容器仍在', !!img2);
      ok('重渲染后图片 src 不变', src1 === src2, src1 + ' vs ' + src2);
    }
  }

  console.log('== E. 模拟考试乱序 + exPickChoice + exGradeChoice（5题全对） ==');
  d.querySelector('.mode-btn[data-view="exam"]').click();
  await sleep(150);
  $('exQuizCount').value = 5; $('exFillCount').value = 0; $('exDuration').value = 30;
  $('exStart').click();
  await sleep(150);
  ok('进入模拟考试', !$('exRunning').classList.contains('hidden'));

  // 在第一题（若为选择/判断）测量乱序
  let examSigMeasured = false, examSigSet = new Set();
  if ($('exQType').textContent === '单选题' || $('exQType').textContent === '多选题' || $('exQType').textContent === '判断题') {
    for (let r = 0; r < 10; r++) {
      const opts = Array.from(d.querySelectorAll('#exQOptions .opt')).map(el =>
        parseInt(el.getAttribute('data-o'), 10));
      examSigSet.add(opts.join(','));
      const c = d.querySelector('#exJumpGrid .cur'); if (c) c.click();
      await sleep(30);
    }
    examSigMeasured = true;
  }
  // 若第一题是判断，其选项应不变；选择题则应出现多种顺序
  const firstIsChoice = $('exQType').textContent === '单选题' || $('exQType').textContent === '多选题';
  if (examSigMeasured) {
    if (firstIsChoice) {
      ok('模拟考试选择题多次渲染出现≥2种顺序', examSigSet.size >= 2, 'distinct=' + examSigSet.size);
    } else {
      ok('模拟考试判断题多次渲染顺序不变', examSigSet.size === 1, 'distinct=' + examSigSet.size);
    }
  }

  // 逐题正确作答（含第一题，data-o 选正确项），共5题
  let answeredAll = true;
  for (let i = 0; i < 5; i++) {
    const qt = $('exQText').textContent;
    const fq = findQ(qt);
    if (!fq) { answeredAll = false; break; }
    const els = Array.from(d.querySelectorAll('#exQOptions .opt'));
    let clickedAny = false;
    els.forEach(el => {
      const o = parseInt(el.getAttribute('data-o'), 10);
      if (fq.q.a.indexOf(o) >= 0) { el.click(); clickedAny = true; }
    });
    if (!clickedAny) answeredAll = false;
    await sleep(50);
    if (i < 4) { $('exNext').click(); await sleep(60); }
  }
  ok('5道题均通过 data-o 点中正确项', answeredAll);
  $('exSubmit').click();
  await sleep(200);
  ok('交卷后进入结果页', !$('exResult').classList.contains('hidden'));
  const cards = d.querySelectorAll('#exResultCards .scard');
  if (cards.length >= 2) {
    const rightNum = parseInt(cards[1].textContent, 10);
    ok('5题全部答对（right=5）', rightNum === 5, 'right=' + rightNum);
    const scoreTxt = cards[0].textContent;
    ok('满分100分', /100/.test(scoreTxt), scoreTxt);
  } else {
    ok('结果卡片存在', false, 'cards=' + cards.length);
  }
  // 详情：第一题 userAns == correctAns
  const details = d.querySelectorAll('#exDetailList .ex-detail');
  if (details.length) {
    ok('详情条数=5', details.length === 5, 'len=' + details.length);
  }

  console.log('');
  console.log('乱序专项验证结果：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('脚本异常：', e); process.exit(2); });
