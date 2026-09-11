/* nbt10991 题库接入完整性校验（只读，不修改任何共享文件）
   加载 data/nbt10991/ch01~ch14.js 与 fill.js，统计题量、校验字段、章节连续性 */
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = 'D:/学习/体系文件/统一学习平台/data/nbt10991';

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

// 用沙箱全局 window 加载数据文件（文件内为 window.CHxx = {...}）
const windowObj = {};
global.window = windowObj;
for (let i = 1; i <= 14; i++) {
  const f = path.join(DIR, 'ch' + (i < 10 ? '0' + i : i) + '.js');
  const code = fs.readFileSync(f, 'utf8');
  // eslint-disable-next-line no-eval
  (0, eval)(code);
}
const fillCode = fs.readFileSync(path.join(DIR, 'fill.js'), 'utf8');
(0, eval)(fillCode);

let choiceTotal = 0;
const chIds = [];
let fieldBad = [];
const typeCount = { single: 0, multi: 0, judge: 0 };
for (let i = 1; i <= 14; i++) {
  const key = 'CH' + (i < 10 ? '0' + i : i);
  const ch = windowObj[key];
  if (!ch) { fail++; console.log('  ✗ 缺少 ' + key); continue; }
  chIds.push(ch.id);
  ch.questions.forEach(q => {
    choiceTotal++;
    if (q.t) typeCount[q.t] = (typeCount[q.t] || 0) + 1;
    // 选择题必须有 t/q/a/e/s；single/multi 还应有 o
    const need = ['t', 'q', 'a', 'e', 's'];
    for (const k of need) if (q[k] === undefined || q[k] === '') fieldBad.push(key + ':' + choiceTotal + ' 缺 ' + k);
    if ((q.t === 'single' || q.t === 'multi') && (!Array.isArray(q.o) || q.o.length < 2)) fieldBad.push(key + ':' + choiceTotal + ' 选项异常');
    if (!Array.isArray(q.a) || q.a.length === 0) fieldBad.push(key + ':' + choiceTotal + ' 答案数组异常');
  });
}

console.log('== 1. 题库接入完整性 ==');
ok('章节 ch01~ch14 全部加载', true);
ok('选择题总数 = 198（实际 ' + choiceTotal + '）', choiceTotal === 198, '实际 ' + choiceTotal);
console.log('    题型分布：单选 ' + typeCount.single + ' / 多选 ' + typeCount.multi + ' / 判断 ' + typeCount.judge);

const FILL = windowObj.FILL;
const fillTotal = FILL.questions.length;
let fillFieldBad = [];
const fillChSet = new Set();
FILL.questions.forEach(q => {
  fillChSet.add(q.ch);
  const need = ['ch', 't', 'q', 'a', 'e', 's'];
  for (const k of need) if (q[k] === undefined || q[k] === '') fillFieldBad.push('fill 缺 ' + k);
  if (!Array.isArray(q.a)) fillFieldBad.push('fill a 非数组');
});
ok('填空题总数 = 85（实际 ' + fillTotal + '）', fillTotal === 85, '实际 ' + fillTotal);

ok('每道选择题含 t/q/a/e/s 字段（single/multi 另含 o）', fieldBad.length === 0, fieldBad.slice(0, 5).join(';'));
ok('每道填空题含 ch/q/a/e/s 字段', fillFieldBad.length === 0, fillFieldBad.slice(0, 5).join(';'));

const continuous = chIds.length === 14 && chIds.every((v, idx) => v === idx + 1);
ok('章节 id 连续 1~14（' + chIds.join(',') + '）', continuous, chIds.join(','));

// 多可接受答案示例：找出 a 数组长度>1 的填空
const multiAns = FILL.questions.filter(q => q.a.some(acc => acc.length > 1));
console.log('    多可接受答案填空数量：' + multiAns.length + '（判分归一化依赖此字段）');
ok('存在多可接受答案的填空题', multiAns.length > 0);

console.log('');
console.log('题库校验结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
