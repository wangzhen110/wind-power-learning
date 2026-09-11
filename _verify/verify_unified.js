/* 统一学习平台 · jsdom 功能验证脚本
   验证：登录/注册/退出、账号数据隔离、三课程加载、答题判分、填空、知识库、统计、门户进度 */
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
    runScripts: 'dangerously',
    resources: 'usable',
    url: 'http://127.0.0.1:8765/index.html',
    pretendToBeVisual: true
  });
  const w = dom.window;
  const d = w.document;
  w.alert = function (m) { console.log('  [alert] ' + m); };
  w.confirm = function () { return true; };
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

  console.log('== 1. 初始登录视图 ==');
  await sleep(600);
  ok('默认显示登录视图', vis('view-login') && !vis('view-portal') && !vis('view-course'));
  ok('登录表单可见', vis('formLogin'));
  ok('注册表单隐藏', !vis('formReg'));

  console.log('== 2. 注册账号 A（zhangsan）==');
  $('tabReg').click();
  ok('切换到注册表单', vis('formReg') && !vis('formLogin'));
  $('rgUser').value = 'zhangsan';
  $('rgNick').value = '张三';
  $('rgPass').value = '1234';
  $('rgPass2').value = '1234';
  fire($('formReg'), 'submit');
  await sleep(200);
  ok('注册后进入门户', vis('view-portal') && !vis('view-login'));
  ok('门户显示昵称', /张三/.test($('portalUser').textContent));
  const cards = d.querySelectorAll('.portal-card');
  ok('门户显示 3 门课程卡片', cards.length === 3, '实际 ' + cards.length);
  ok('卡片1 题量正确（330）', /选择题 330/.test(cards[0].textContent));
  ok('卡片2 题量正确（216）', /选择题 216/.test(cards[1].textContent));
  ok('卡片3 题量正确（198）', /选择题 198/.test(cards[2].textContent));

  console.log('== 3. 进入课程 gbt46154 ==');
  cards[0].querySelector('.pc-btn').click();
  const loaded1 = await wait(() => $('lecTitle').textContent !== '正在加载课程数据…', 8000);
  ok('课程数据加载完成', loaded1);
  ok('课程标题正确', /风力发电机组用电梯制造与安装安全规范/.test($('courseTitle').textContent));
  ok('课程栏显示账号', /张三/.test($('courseBarUser').textContent));
  ok('题库总数 330', $('totalCount').textContent === '330', '实际 ' + $('totalCount').textContent);
  ok('章节导航 14 章', d.querySelectorAll('#chapNav .chap-item').length === 14);
  ok('讲解视图默认可见', vis('view-lecture'));
  ok('讲解有内容', $('lecSlide').textContent.length > 50);

  console.log('== 4. 答题判分 ==');
  $('lecToQuiz').click();
  await sleep(100);
  ok('答题视图可见', vis('view-quiz'));
  ok('答题卡有题目', $('qText').textContent.length > 0);
  const q = w.pool ? w.pool[0] : null; // IIFE 内不可直接访问，改用 DOM 行为验证
  // 通过点击选项答题：判断题/单选点正确项——先看题型
  const typeTxt = $('qType').textContent;
  const optEls = d.querySelectorAll('#qOptions .opt');
  const opts = Array.from(optEls).map(o => o.textContent.trim());
  const qText = $('qText').textContent;
  // 无法直接知道正确答案，读取 DOM 中正确答案隐藏信息？改为：点击第一个选项后若单选会自动提交，观察是否出现反馈
  optEls[0].click();
  await sleep(100);
  ok('单选点击后出现反馈', !$('qFeedback').classList.contains('hidden') || /提交答案/.test($('qNext').textContent));
  if (!$('qFeedback').classList.contains('hidden')) {
    ok('反馈有解析', $('fbExplain').textContent.length > 0);
    ok('反馈有出处', /出处/.test($('fbSource').textContent));
  }
  ok('顶栏已答统计 ≥1', parseInt($('sDone').textContent, 10) >= 1, '实际 ' + $('sDone').textContent);

  console.log('== 5. 知识库弹窗 ==');
  const srcBtn = d.querySelector('#fbSource .src-link');
  if (srcBtn) {
    srcBtn.click();
    await sleep(100);
    ok('知识库弹窗打开', !$('kbModal').classList.contains('hidden'));
    ok('知识库有内容', $('kbBody').textContent.length > 5);
    $('kbClose').click();
    ok('知识库可关闭', $('kbModal').classList.contains('hidden'));
  } else {
    ok('出处按钮存在（跳过后两项）', false, '无 src-link');
  }

  console.log('== 6. 填空模式 ==');
  d.querySelector('.mode-btn[data-view="fill"]').click();
  await sleep(100);
  ok('填空视图可见', vis('view-fill'));
  ok('填空题有内容', $('fqText').textContent.length > 0);
  const inputs = d.querySelectorAll('#fqOptions .fill-input');
  ok('填空题渲染输入框', inputs.length >= 1);
  if (inputs.length) {
    // 填空可能有多个空，全部填同一种占位（判错也无妨，只要出现反馈即可）
    for (let i = 0; i < inputs.length; i++) inputs[i].value = '占位答案';
    $('fqNext').click();
    await sleep(100);
    ok('填空提交后出现反馈', !$('fqFeedback').classList.contains('hidden'));
  }

  console.log('== 7. 统计视图 ==');
  d.querySelector('.mode-btn[data-view="stats"]').click();
  await sleep(100);
  ok('统计视图可见', vis('view-stats'));
  ok('统计卡片渲染', d.querySelectorAll('#statCards .scard').length === 6);
  ok('各章掌握渲染', d.querySelectorAll('#chapStats .cs-row').length === 14);

  console.log('== 8. 返回门户 + 退出登录 ==');
  $('btnBackPortal').click();
  await sleep(100);
  ok('返回门户', vis('view-portal') && !vis('view-course'));
  ok('门户进度显示已答 ≥1', /已答 [1-9]/.test(d.querySelectorAll('.portal-card')[0].querySelector('.pc-progress').textContent));
  $('btnLogout').click();
  await sleep(200);
  ok('退出后回到登录页', vis('view-login') && !vis('view-portal'));

  console.log('== 9. 错误密码被拒 ==');
  $('liUser').value = 'zhangsan';
  $('liPass').value = 'wrong';
  fire($('formLogin'), 'submit');
  await sleep(100);
  ok('错误密码提示', /密码不正确/.test($('liMsg').textContent));
  ok('仍停留在登录页', vis('view-login'));

  console.log('== 10. 正确登录账号 A ==');
  $('liPass').value = '1234';
  fire($('formLogin'), 'submit');
  await sleep(200);
  ok('登录成功进入门户', vis('view-portal'));

  console.log('== 11. 注册账号 B（lisi）→ 数据独立验证 ==');
  $('btnLogout').click();
  await sleep(100);
  $('tabReg').click();
  $('rgUser').value = 'lisi';
  $('rgNick').value = '李四';
  $('rgPass').value = 'abcd';
  $('rgPass2').value = 'abcd';
  fire($('formReg'), 'submit');
  await sleep(200);
  ok('账号 B 进入门户', vis('view-portal'));
  ok('门户显示李四', /李四/.test($('portalUser').textContent));
  ok('账号 B 的课程1进度为 0（数据隔离）', /已答 0/.test(d.querySelectorAll('.portal-card')[0].querySelector('.pc-progress').textContent));
  d.querySelectorAll('.portal-card')[0].querySelector('.pc-btn').click();
  const loaded2 = await wait(() => $('lecTitle').textContent !== '正在加载课程数据…', 8000);
  ok('账号 B 课程加载完成', loaded2);
  ok('账号 B 已答为 0', $('sDone').textContent === '0', '实际 ' + $('sDone').textContent);

  console.log('== 12. 切换课程 nbt11773 / nbt10991 ==');
  $('btnBackPortal').click();
  await sleep(100);
  d.querySelectorAll('.portal-card')[1].querySelector('.pc-btn').click();
  const loaded3 = await wait(() => $('lecTitle').textContent !== '正在加载课程数据…', 8000);
  ok('nbt11773 加载完成', loaded3);
  ok('nbt11773 题量 216', $('totalCount').textContent === '216', '实际 ' + $('totalCount').textContent);
  ok('nbt11773 章节 9 章', d.querySelectorAll('#chapNav .chap-item').length === 9);
  ok('nbt11773 标题正确', /内附件技术规范/.test($('courseTitle').textContent));
  $('btnBackPortal').click();
  await sleep(100);
  d.querySelectorAll('.portal-card')[2].querySelector('.pc-btn').click();
  const loaded4 = await wait(() => $('lecTitle').textContent !== '正在加载课程数据…', 8000);
  ok('nbt10991 加载完成', loaded4);
  ok('nbt10991 题量 198', $('totalCount').textContent === '198', '实际 ' + $('totalCount').textContent);
  ok('nbt10991 章节 14 章', d.querySelectorAll('#chapNav .chap-item').length === 14);
  ok('nbt10991 标题正确', /塔架升降机/.test($('courseTitle').textContent));

  console.log('== 13. 用户重复注册拦截 ==');
  $('btnLogout').click();
  await sleep(100);
  $('tabReg').click();
  $('rgUser').value = 'zhangsan';
  $('rgNick').value = 'x';
  $('rgPass').value = '1234';
  $('rgPass2').value = '1234';
  fire($('formReg'), 'submit');
  await sleep(100);
  ok('重复账号被拦截', /已存在/.test($('rgMsg').textContent));

  console.log('');
  console.log('结果：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('脚本异常：', e); process.exit(2); });
