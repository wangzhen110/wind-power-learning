/* 模拟考试模块 · jsdom 功能自测
   覆盖：组卷配置生效 / 两次组卷题目不同（随机性）/ 选择题判分 / 填空题判分（多可接受答案）
        / 成绩按账号隔离 / 历史成绩回读 / 题量边界校验 */
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
  w.alert = function (m) { console.log('  [alert] ' + m); };
  w.confirm = function () { return true; };
  w.scrollTo = function () {};
  const $ = id => d.getElementById(id);
  const wait = async (cond, timeout) => {
    const t0 = Date.now();
    while (!cond()) { if (Date.now() - t0 > timeout) return false; await sleep(50); }
    return true;
  };
  const fire = (el, ev) => el.dispatchEvent(new w.Event(ev, { bubbles: true, cancelable: true }));

  async function regAndEnter(uname, courseIdx) {
    await sleep(300);
    $('tabReg').click();
    $('rgUser').value = uname; $('rgNick').value = uname;
    $('rgPass').value = '1234'; $('rgPass2').value = '1234';
    fire($('formReg'), 'submit');
    await sleep(300);
    d.querySelectorAll('.portal-card')[courseIdx].querySelector('.pc-btn').click();
    await wait(() => $('lecTitle').textContent !== '正在加载课程数据…', 15000);
  }
  function findChoiceByText(text) {
    for (let i = 1; i <= 14; i++) {
      const k = 'CH' + (i < 10 ? '0' + i : i);
      const ch = w[k]; if (!ch) continue;
      const q = ch.questions.find(x => x.q === text);
      if (q) return { q, opts: q.t === 'judge' ? ['正确', '错误'] : q.o };
    }
    return null;
  }
  function findFillByText(text) {
    if (!w.FILL) return null;
    return w.FILL.questions.find(x => x.q === text) || null;
  }

  console.log('== 1. 注册并进入 gbt46154，切到模拟考试 ==');
  await regAndEnter('examuser1', 0);
  d.querySelector('.mode-btn[data-view="exam"]').click();
  await sleep(200);
  ok('考试视图可见', !$('view-exam').classList.contains('hidden'));
  ok('配置面板可见', !$('exConfig').classList.contains('hidden'));
  ok('选择题题量上限显示 330', $('exAvailChoice').textContent === '330', $('exAvailChoice').textContent);
  ok('填空题题量上限显示 74', $('exAvailFill').textContent === '74', $('exAvailFill').textContent);
  ok('章节下拉含全部章节+14章', $('exChapter').options.length === 15, '实际 ' + $('exChapter').options.length);

  console.log('== 2. 组卷：默认 20 选择 + 5 填空，共 25 题 ==');
  $('exQuizCount').value = 20; $('exFillCount').value = 5; $('exDuration').value = 30;
  $('exStart').click();
  await sleep(100);
  ok('进入考试界面', !$('exRunning').classList.contains('hidden'));
  ok('答题卡按钮数 = 25', d.querySelectorAll('#exJumpGrid .jump-btn').length === 25, '实际 ' + d.querySelectorAll('#exJumpGrid .jump-btn').length);
  ok('倒计时 30:00', $('exTimer').textContent === '30:00', $('exTimer').textContent);
  ok('进度显示 第1/共25题', /第 1 \/ 共 25 题/.test($('exProgress').textContent), $('exProgress').textContent);

  console.log('== 3. 选择题判分：答对当前单选题 ==');
  let curText = $('exQText').textContent;
  let found = findChoiceByText(curText);
  ok('当前题可在题库定位（选择/判断）', !!found);
  if (found) {
    // 选第一个正确选项
    const correctIdx = found.q.a[0];
    const optEls = d.querySelectorAll('#exQOptions .opt');
    ok('选项数与题目一致', optEls.length === found.opts.length, optEls.length + ' vs ' + found.opts.length);
    optEls[correctIdx].click();
    await sleep(50);
    ok('选中后选项高亮', optEls[correctIdx].classList.contains('sel'));
    ok('当前题标记为已答（答题卡 done）', d.querySelectorAll('#exJumpGrid .jump-btn')[0].classList.contains('done'));
  }

  console.log('== 4. 遍历到填空题并正确作答（多可接受答案） ==');
  // 逐题往后找填空题
  let fillDone = false;
  for (let step = 0; step < 25; step++) {
    if ($('exQType').textContent === '填空题') {
      const fq = findFillByText($('exQText').textContent);
      ok('填空题可在题库定位', !!fq);
      if (fq) {
        const inputs = d.querySelectorAll('#exQOptions .fill-input');
        ok('填空输入框数 = 空数', inputs.length === fq.a.length);
        for (let i = 0; i < inputs.length; i++) inputs[i].value = fq.a[i][0]; // 填第一个可接受答案
        $('exNext').click();
        await sleep(50);
        fillDone = true;
        break;
      }
    }
    $('exNext').click();
    await sleep(30);
  }
  ok('至少遇到并作答一道填空题', fillDone);

  console.log('== 5. 交卷 -> 结果页 ==');
  $('exSubmit').click();
  await sleep(100);
  ok('结果页可见', !$('exResult').classList.contains('hidden'));
  const cards = d.querySelectorAll('#exResultCards .scard');
  ok('结果卡片 5 张', cards.length === 5, '实际 ' + cards.length);
  ok('详情条数 = 25', d.querySelectorAll('#exDetailList .ex-detail').length === 25, '实际 ' + d.querySelectorAll('#exDetailList .ex-detail').length);
  const scoreText = cards[0].textContent;
  ok('总分是数字%', /\d+/.test(scoreText), scoreText);
  ok('答对题数 >= 2（至少答对1选择+1填空）', parseInt(cards[1].textContent) >= 2, cards[1].textContent);
  // 校验存储键与结构
  const histRaw = w.localStorage.getItem('unified_v1_gbt46154_examuser1_exam');
  ok('成绩已写入 exam 存储键', !!histRaw);
  if (histRaw) {
    const arr = JSON.parse(histRaw);
    ok('成绩数组长度 1', arr.length === 1);
    const r = arr[0];
    ok('记录含 score/right/total/durationSec/config/details',
      typeof r.score === 'number' && r.right >= 0 && r.total === 25 &&
      typeof r.durationSec === 'number' && r.config && Array.isArray(r.details));
    ok('details 长度=25 且含 ok/userAns/correctAns', r.details.length === 25 &&
      r.details.every(x => typeof x.ok === 'boolean' && x.userAns && x.correctAns));
  }

  console.log('== 6. 历史成绩回读 ==');
  $('exHistory2').click();
  await sleep(100);
  ok('历史弹窗打开', !$('examHistModal').classList.contains('hidden'));
  ok('历史列表有 1 条记录', d.querySelectorAll('.ex-hist-row').length === 1);
  ok('记录含得分文字', /\d+ 分/.test($('examHistBody').textContent));
  d.querySelector('#examHistBody .xh-view').click();
  await sleep(100);
  ok('点详情回到结果页', !$('exResult').classList.contains('hidden'));

  console.log('== 7. 组卷随机性：两次组卷题目不同 ==');
  $('exRetry').click();
  await sleep(100);
  $('exQuizCount').value = 10; $('exFillCount').value = 0;
  function paperSignature() {
    $('exStart').click();
    const sig = Array.from(d.querySelectorAll('#exJumpGrid .jump-btn')).map(b => b.textContent).join(',');
    // 收集前几题题干
    const texts = [];
    for (let i = 0; i < 10; i++) { texts.push($('exQText').textContent); if (i < 9) $('exNext').click(); }
    return texts;
  }
  const run1 = paperSignature();
  // 交卷回配置
  $('exSubmit').click(); await sleep(100);
  $('exRetry').click(); await sleep(100);
  $('exQuizCount').value = 10; $('exFillCount').value = 0;
  const run2 = paperSignature();
  const same = run1.length === run2.length && run1.every((t, i) => t === run2[i]);
  ok('两次组卷题目序列不完全相同（随机性生效）', !same, same ? '两次完全一致' : '已不同');
  $('exSubmit').click(); await sleep(100);

  console.log('== 8. 边界校验：题量超过题库上限会被截断 ==');
  $('exRetry').click(); await sleep(100);
  $('exQuizCount').value = 999; $('exFillCount').value = 999;
  $('exStart').click(); await sleep(100);
  const btnCount = d.querySelectorAll('#exJumpGrid .jump-btn').length;
  ok('题量被上限钳制（选择≤100、填空≤50，合计 150）', btnCount === 150, '实际 ' + btnCount);
  $('exSubmit').click(); await sleep(100);

  console.log('== 9. 账号隔离：换账号看不到对方成绩 ==');
  $('exRetry').click(); await sleep(100);
  // 退出 -> 注册账号2
  $('btnBackPortal').click(); await sleep(150);
  $('btnLogout2').click(); await sleep(150);
  $('tabReg').click();
  $('rgUser').value = 'examuser2'; $('rgNick').value = 'u2';
  $('rgPass').value = 'abcd'; $('rgPass2').value = 'abcd';
  fire($('formReg'), 'submit'); await sleep(300);
  d.querySelectorAll('.portal-card')[0].querySelector('.pc-btn').click();
  await wait(() => $('lecTitle').textContent !== '正在加载课程数据…', 15000);
  d.querySelector('.mode-btn[data-view="exam"]').click();
  await sleep(100);
  $('exHistory').click(); await sleep(100);
  ok('账号2历史为空（隔离）', /还没有模拟考试记录/.test($('examHistBody').textContent), $('examHistBody').textContent.slice(0, 40));
  const key2 = w.localStorage.getItem('unified_v1_gbt46154_examuser2_exam');
  ok('账号2 exam 键不存在', !key2);

  console.log('');
  console.log('模拟考试自测结果：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('脚本异常：', e); process.exit(2); });
