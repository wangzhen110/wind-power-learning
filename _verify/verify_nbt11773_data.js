/* nbt11773 题库接入完整性 · 只读 node 统计（不改任何数据文件） */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = 'D:/学习/体系文件/统一学习平台/data/nbt11773';
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

// 构造沙箱 window，加载 ch01~ch09
const sandbox = { window: {} };
vm.createContext(sandbox);
const chapters = {};
let choiceTotal = 0;
const chIds = [];
let missingFieldProblems = [];

for (let i = 1; i <= 9; i++) {
  const file = path.join(DIR, 'ch' + String(i).padStart(2, '0') + '.js');
  const code = fs.readFileSync(file, 'utf8');
  vm.runInContext(code, sandbox, { filename: file });
}
// 收集 window.CH01..CH09
for (let i = 1; i <= 9; i++) {
  const key = 'CH' + String(i).padStart(2, '0');
  const ch = sandbox.window[key];
  if (!ch) { ok('加载 ' + key, false, '未定义'); continue; }
  chIds.push(ch.id);
  chapters[ch.id] = ch;
  choiceTotal += ch.questions.length;
  // 字段校验
  ch.questions.forEach((q, idx) => {
    const need = ['t', 'q', 'a', 'e', 's'];
    const miss = need.filter(f => q[f] === undefined || q[f] === null || q[f] === '');
    if (miss.length) missingFieldProblems.push(key + '#' + idx + ' 缺 ' + miss.join(','));
    // 选择题应有 o 字段（judge 除外，但 judge 也算选择题）
    if ((q.t === 'single' || q.t === 'multi') && (!q.o || !q.o.length)) {
      missingFieldProblems.push(key + '#' + idx + ' ' + q.t + ' 缺选项 o');
    }
  });
}

// 填空题
vm.runInContext(fs.readFileSync(path.join(DIR, 'fill.js'), 'utf8'), sandbox, { filename: 'fill.js' });
const FILL = sandbox.window.FILL;
let fillTotal = FILL.questions.length;
let fillFieldProblems = [];
FILL.questions.forEach((q, idx) => {
  const need = ['ch', 'q', 'a', 'e', 's'];
  const miss = need.filter(f => q[f] === undefined || q[f] === null || q[f] === '');
  if (miss.length) fillFieldProblems.push('fill#' + idx + ' 缺 ' + miss.join(','));
});

console.log('== 1. 题库接入完整性 ==');
ok('选择题总数 = 216', choiceTotal === 216, '实际 ' + choiceTotal);
ok('填空题总数 = 81', fillTotal === 81, '实际 ' + fillTotal);
ok('选择题每题字段 t/q/a/e/s 齐全', missingFieldProblems.length === 0, missingFieldProblems.slice(0, 5).join('; '));
ok('填空题每题字段 ch/q/a/e/s 齐全', fillFieldProblems.length === 0, fillFieldProblems.slice(0, 5).join('; '));
ok('章节 9 个且 id 连续 1~9', chIds.length === 9 && chIds.every((id, i) => id === i + 1), '实际 ' + JSON.stringify(chIds));

// 题型分布
const typeDist = {};
Object.values(chapters).forEach(ch => ch.questions.forEach(q => { typeDist[q.t] = (typeDist[q.t] || 0) + 1; }));
console.log('  [信息] 选择题型分布:', JSON.stringify(typeDist));
const fillChSet = [...new Set(FILL.questions.map(q => q.ch))].sort((a, b) => a - b);
console.log('  [信息] 填空题覆盖章节:', JSON.stringify(fillChSet));

console.log('');
console.log('题库完整性结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
