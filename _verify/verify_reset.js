/* 答题进度清空功能 · jsdom 验证脚本
   场景1：全部清空（btnReset / clearAll）——选择+填空+标记全部归零，localStorage 落盘为空对象
   场景2：章节级清空（chap-clear / clearChapter）——仅目标章选择与填空记录消失，其他章原样保留，且不触发章节切换 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = 'D:/学习/体系文件/统一学习平台';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 用 vm 直接加载课程数据文件，计算选择题 gid 按章节的分布，以及填空题 F 索引所属章节
function loadData(rel) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.window;
}
function buildGidMap() {
  const chapCount = []; // chapCount[章节号] = 该章选择题数
  let n = 1;
  while (true) {
    const k = 'CH' + (n < 10 ? '0' + n : n);
    try {
      const w = loadData('data/gbt46154/' + k.toLowerCase() + '.js');
      if (!w[k]) break;
      chapCount[n] = w[k].questions.length;
      n++;
    } catch (e) { break; }
  }
  // gid 偏移：第1章从 0 开始，后续章节依次累加
  const gidStart = {};
  let acc = 0;
  for (let c = 1; c < chapCount.length; c++) { gidStart[c] = acc; acc += chapCount[c]; }
  // 填空题：FILL.questions 顺序即 F 索引，每项 q.ch 为章节号
  const fw = loadData('data/gbt46154/fill.js');
  const fillByChap = {}; // fillByChap[章节号] = [F 索引...]
  fw.FILL.questions.forEach((q, i) => {
    const c = Number(q.ch);
    (fillByChap[c] = fillByChap[c] || []).push('F' + i);
  });
  return { chapCount, gidStart, fillByChap };
}

(async function () {
  const map = buildGidMap();
  console.log('章节选择题数分布：', JSON.stringify(map.chapCount.slice(1)));
  console.log('第1章 F索引：', JSON.stringify(map.fillByChap[1] && map.fillByChap[1].slice(0, 3)), '...');
  console.log('第2章 F索引：', JSON.stringify(map.fillByChap[2] && map.fillByChap[2].slice(0, 3)), '...');

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: 'usable',
    url: 'http://127.0.0.1:8765/index.html',
    pretendToBeVisual: true
  });
  const w = dom.window;
  const d = w.document;
  w.alert = function (m) { console.log('  [alert] ' + m); };
  w.confirm = function () { console.log('  [confirm] 返回 true'); return true; };
  w.scrollTo = function () {};
  w.URL.createObjectURL = function () { return 'blob:mock'; };
  w.URL.revokeObjectURL = function () {};

  const $ = id => d.getElementById(id);
  const vis = id => !$(id).classList.contains('hidden');
  const wait = async (cond, timeout) => {
    const t0 = Date.now();
    while (!cond()) {
      if (Date.now() - t0 > timeout) return false;
      await sleep(50);
    }
    return true;
  };
  const fire = (el, ev) => { el.dispatchEvent(new w.Event(ev, { bubbles: true, cancelable: true })); };

  // 读取 localStorage 中本课程最近写入的 quiz / fill 状态
  function readState() {
    let quizRaw = null, fillRaw = null;
    Object.keys(w.localStorage).forEach(function (k) {
      if (/^unified_v1_.*_quiz$/.test(k)) quizRaw = w.localStorage.getItem(k);
      if (/^unified_v1_.*_fill$/.test(k)) fillRaw = w.localStorage.getItem(k);
    });
    return {
      quiz: quizRaw ? JSON.parse(quizRaw) : { ans: {}, mark: {} },
      fill: fillRaw ? JSON.parse(fillRaw) : { ans: {}, mark: {} },
      quizRaw: quizRaw,
      fillRaw: fillRaw
    };
  }
  const keysOf = o => Object.keys(o || {});

  // 驱动作答：当前筛选下回答第一题（单选/判断点选项即交卷；多选点选项后点提交）
  async function answerFirstChoice() {
    await sleep(50);
    const opt = d.querySelector('#qOptions .opt');
    if (!opt) throw new Error('选择题选项未渲染');
    opt.click();
    await sleep(30);
    if (/提交答案/.test($('qNext').textContent)) $('qNext').click();
    await sleep(60);
  }
  async function answerFirstFill() {
    await sleep(50);
    const inputs = d.querySelectorAll('#fqOptions .fill-input');
    if (!inputs.length) throw new Error('填空输入框未渲染');
    for (let i = 0; i < inputs.length; i++) inputs[i].value = '占位答案';
    $('fqNext').click();
    await sleep(60);
  }

  console.log('== 0. 注册账号并进入 gbt46154 课程 ==');
  await sleep(600);
  $('tabReg').click();
  $('rgUser').value = 'resettester';
  $('rgPass').value = '1234';
  $('rgPass2').value = '1234';
  fire($('formReg'), 'submit');
  await sleep(200);
  ok('注册后进入门户', vis('view-portal'));
  d.querySelectorAll('.portal-card')[0].querySelector('.pc-btn').click();
  const loaded = await wait(() => $('lecTitle').textContent !== '正在加载课程数据…', 8000);
  ok('课程数据加载完成', loaded);
  ok('章节导航 14 章', d.querySelectorAll('#chapNav .chap-item').length === 14);
  ok('每章带清空按钮，数量=章节数', d.querySelectorAll('#chapNav .chap-item .chap-clear').length === 14);

  // 记录 gid：第1章选择第一题 = gidStart[1]；第2章第一题 = gidStart[2]
  const g1 = map.gidStart[1], g2 = map.gidStart[2];
  const f1 = map.fillByChap[1][0], f2 = map.fillByChap[2][0];
  console.log('  目标 gid：第1章选择=' + g1 + ' 第2章选择=' + g2 + ' 第1章填空=' + f1 + ' 第2章填空=' + f2);

  /* ============ 场景 1：全部清空 ============ */
  console.log('== 场景1：先在两章作答（选择+填空+标记），再全部清空 ==');
  // 第1章选择题
  d.querySelector('.mode-btn[data-view="quiz"]').click();
  await sleep(80);
  $('fChapter').value = '1'; fire($('fChapter'), 'change'); await sleep(80);
  await answerFirstChoice();
  ok('第1章选择题已作答并写入 ST.ans', keysOf(readState().quiz.ans).includes(String(g1)));
  $('qMark').click(); await sleep(30);
  ok('第1章选择题已加标记', keysOf(readState().quiz.mark).includes(String(g1)));
  // 第2章选择题
  $('fChapter').value = '2'; fire($('fChapter'), 'change'); await sleep(80);
  await answerFirstChoice();
  ok('第2章选择题已作答', keysOf(readState().quiz.ans).includes(String(g2)));
  // 第1章填空题
  d.querySelector('.mode-btn[data-view="fill"]').click();
  await sleep(80);
  $('ffChapter').value = '1'; fire($('ffChapter'), 'change'); await sleep(80);
  await answerFirstFill();
  ok('第1章填空题已作答并写入 STF.ans', keysOf(readState().fill.ans).includes(f1));
  $('fqMark').click(); await sleep(30);
  ok('第1章填空题已加标记', keysOf(readState().fill.mark).includes(f1));
  // 第2章填空题
  $('ffChapter').value = '2'; fire($('ffChapter'), 'change'); await sleep(80);
  await answerFirstFill();
  ok('第2章填空题已作答', keysOf(readState().fill.ans).includes(String(f2)));

  let st = readState();
  ok('清空前 ST.ans ≥ 2 条', keysOf(st.quiz.ans).length >= 2, '实际 ' + keysOf(st.quiz.ans).length);
  ok('清空前 STF.ans ≥ 2 条', keysOf(st.fill.ans).length >= 2, '实际 ' + keysOf(st.fill.ans).length);

  // 触发「清空学习记录」（btnReset，confirm 已 mock 为 true）
  $('btnReset').click();
  await sleep(100);
  st = readState();
  ok('全部清空后 ST.ans 键数为 0', keysOf(st.quiz.ans).length === 0, '实际 ' + keysOf(st.quiz.ans).length);
  ok('全部清空后 ST.mark 键数为 0', keysOf(st.quiz.mark).length === 0, '实际 ' + keysOf(st.quiz.mark).length);
  ok('全部清空后 STF.ans 键数为 0', keysOf(st.fill.ans).length === 0, '实际 ' + keysOf(st.fill.ans).length);
  ok('全部清空后 STF.mark 键数为 0', keysOf(st.fill.mark).length === 0, '实际 ' + keysOf(st.fill.mark).length);
  ok('localStorage quiz 落盘为空对象', st.quizRaw === '{"ans":{},"mark":{}}', '实际 ' + st.quizRaw);
  ok('localStorage fill 落盘为空对象', st.fillRaw === '{"ans":{},"mark":{}}', '实际 ' + st.fillRaw);
  ok('顶栏已答统计归零', $('sDone').textContent === '0', '实际 ' + $('sDone').textContent);

  /* ============ 场景 2：章节级清空 ============ */
  console.log('== 场景2：重新在两章作答，只清空第1章，第2章记录须保留 ==');
  // 重新作答：第1、2章选择题
  d.querySelector('.mode-btn[data-view="quiz"]').click();
  await sleep(80);
  $('fChapter').value = '1'; fire($('fChapter'), 'change'); await sleep(80);
  await answerFirstChoice();
  $('qMark').click(); await sleep(30);
  $('fChapter').value = '2'; fire($('fChapter'), 'change'); await sleep(80);
  await answerFirstChoice();
  // 重新作答：第1、2章填空题
  d.querySelector('.mode-btn[data-view="fill"]').click();
  await sleep(80);
  $('ffChapter').value = '1'; fire($('ffChapter'), 'change'); await sleep(80);
  await answerFirstFill();
  $('ffChapter').value = '2'; fire($('ffChapter'), 'change'); await sleep(80);
  await answerFirstFill();

  st = readState();
  ok('场景2 作答后：ST.ans 含 g1 与 g2',
    keysOf(st.quiz.ans).includes(String(g1)) && keysOf(st.quiz.ans).includes(String(g2)));
  ok('场景2 作答后：ST.mark 含 g1', keysOf(st.quiz.mark).includes(String(g1)));
  ok('场景2 作答后：STF.ans 含 f1 与 f2',
    keysOf(st.fill.ans).includes(f1) && keysOf(st.fill.ans).includes(f2));

  // 切到讲解视图并选中第3章，保证点击 chap-clear 不触发章节切换
  d.querySelector('.mode-btn[data-view="lecture"]').click();
  await sleep(80);
  // 注意：章节点击会触发 buildNav() 重建整个 chapNav，须用「当前 DOM」重新计算 active 索引
  function activeChapIndex() {
    const list = d.querySelectorAll('#chapNav .chap-item');
    let idx = -1;
    list.forEach(function (el, i) { if (el.classList.contains('active')) idx = i; });
    return idx;
  }
  d.querySelectorAll('#chapNav .chap-item')[2].click(); // 选中第3章（curChap=2）
  await sleep(80);
  const activeIdxBefore = activeChapIndex();
  ok('切到第3章讲解（active=2）', activeIdxBefore === 2, '实际 ' + activeIdxBefore);

  // 点击第1章的 chap-clear 按钮
  const firstItems = d.querySelectorAll('#chapNav .chap-item');
  const clearBtn = firstItems[0].querySelector('.chap-clear');
  ok('chap-clear 按钮存在', !!clearBtn);
  clearBtn.click();
  await sleep(100);

  st = readState();
  ok('章节清空后：第1章选择 ans 键消失', !keysOf(st.quiz.ans).includes(String(g1)));
  ok('章节清空后：第1章选择 mark 键消失', !keysOf(st.quiz.mark).includes(String(g1)));
  ok('章节清空后：第1章填空 ans 键消失', !keysOf(st.fill.ans).includes(f1));
  ok('章节清空后：第2章选择 ans 保留', keysOf(st.quiz.ans).includes(String(g2)));
  ok('章节清空后：第2章填空 ans 保留', keysOf(st.fill.ans).includes(f2));
  ok('其他章选择 ans 键总数=1（仅 g2）', keysOf(st.quiz.ans).length === 1, '实际 ' + keysOf(st.quiz.ans).length);
  ok('其他章填空 ans 键总数=1（仅 f2）', keysOf(st.fill.ans).length === 1, '实际 ' + keysOf(st.fill.ans).length);

  // 章节未切换：active 仍是第3章
  const itemsAfter = d.querySelectorAll('#chapNav .chap-item');
  const activeIdxAfter = activeChapIndex();
  ok('点击 chap-clear 未触发章节切换（active 仍=2）', activeIdxAfter === 2, '实际 ' + activeIdxAfter);
  ok('讲解标题仍为第3章', /第 3 章/.test($('lecChap').textContent), '实际 ' + $('lecChap').textContent);
  ok('清空后导航按钮数量仍=14', itemsAfter.length === 14);

  console.log('');
  console.log('结果：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('脚本异常：', e); process.exit(2); });
