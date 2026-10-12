// 纯本地：拿已有的题目转储，用 answer-exercises.mjs 里那段一模一样的判据跑一遍，
// 检查"可自动作答"这个分类会不会把不该答的题放进来。不发起任何网络请求。
//   node .cdp/test-verifiable.mjs
import fs from 'node:fs';

const norm = (v) => String(v || '').split(/[|,]/).map((x) => x.trim()).filter(Boolean).sort().join(',');

// 与 answer-exercises.mjs 中的判据保持一致（复制而非 import，因为那段是嵌在页面侧模板串里的）
function verdict(q, SUBJECTIVE) {
  const right = (q.optionVos || []).filter((o) => o.answerFlag === 1).map((o) => o.id);
  let verifiable = false;
  if (q.questionType === 1) verifiable = right.length === 1 && norm(right) === norm(q.referenceAnswer);
  else if (q.questionType === 2) verifiable = right.length > 1 && norm(right) === norm(q.referenceAnswer);
  else if (q.questionType === 3) verifiable = /^[01]$/.test(String(q.referenceAnswer == null ? '' : q.referenceAnswer).trim());
  else if (SUBJECTIVE && (q.questionType === 5 || q.questionType === 6)) verifiable = String(q.referenceAnswer || '').replace(/<[^>]+>/g, '').trim().length > 0;
  return { verifiable, rightCount: right.length };
}

// 从任意 JSON 里捞出所有像题目的对象
const collect = (x, out) => {
  if (Array.isArray(x)) { x.forEach((y) => collect(y, out)); return; }
  if (!x || typeof x !== 'object') return;
  if (x.questionType !== undefined && ('referenceAnswer' in x || 'optionVos' in x)) out.push(x);
  Object.values(x).forEach((y) => collect(y, out));
};

const seen = new Map();
for (const f of process.argv.slice(2)) {
  let d; try { d = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { console.log(`跳过不可解析的 ${f}`); continue; }
  const arr = []; collect(d, arr);
  for (const q of arr) if (q.id && !seen.has(String(q.id))) seen.set(String(q.id), q);
}
const qs = [...seen.values()];
console.log(`从转储里取到 ${qs.length} 道不同题目，按题型跑判据：`);

// 样本有效性闸门：单选/多选的判据依赖 optionVos 里的 answerFlag。转储若来自不带这个字段的接口
// （实测 verify-exercise-snapshot.json 就没有 optionVos），跑出来的"可作数"会低得离谱，
// 那是输入形状的问题而不是判据的问题 —— 这种情况下必须判测试无效，而不是给个误导性的数。
const mc = qs.filter((q) => q.questionType === 1 || q.questionType === 2);
const mcWithOptions = mc.filter((q) => (q.optionVos || []).length > 0).length;
const invalidForMC = mc.length > 0 && mcWithOptions / mc.length < 0.5;
if (invalidForMC) {
  console.log(`\n✗ 样本无效：${mc.length} 道单选/多选里，带 optionVos 的有 ${mcWithOptions} 道。`);
  console.log('  这份转储不含选项数据（来自别的接口视图），无法检验单选/多选的判据；下面的数字只作参考，不构成结论。');
  console.log('  要检验单选/多选，得用 studyRecordExercises/exercisesList 的原始响应。');
}
const onlyT3 = qs.filter((q) => q.questionType === 3);
console.log(`  对本次输入有效的部分：判断题 ${onlyT3.length} 道（不依赖选项，可直接验）`);

const TYPE = { 1: '单选', 2: '多选', 3: '判断', 5: '简答', 6: '问答', 7: '编程', 8: '设计' };
const stat = {};
const problems = [];
for (const q of qs) {
  const v = verdict(q, false);
  const k = q.questionType + '=' + (TYPE[q.questionType] || '未知');
  stat[k] = stat[k] || { n: 0, ok: 0, noRef: 0 };
  stat[k].n++;
  if (v.verifiable) stat[k].ok++;
  // 三条不变式：判错方向比漏判更贵
  if (v.verifiable && !String(q.referenceAnswer || '').trim()) problems.push([q.id, k, '判为可做但参考答案为空']);
  if ((q.questionType === 1 || q.questionType === 2) && v.verifiable && v.rightCount === 0) problems.push([q.id, k, '判为可做但 optionVos 里没有 answerFlag=1']);
  if (q.questionType === 1 && v.rightCount > 1 && v.verifiable) problems.push([q.id, k, '单选题却有多个正确选项还判为可做']);
  if (q.questionType === 2 && v.rightCount === 1 && v.verifiable) problems.push([q.id, k, '多选题只有一个正确选项还判为可做']);
  if (q.questionType === 3 && v.verifiable && !/^[01]$/.test(String(q.referenceAnswer).trim())) problems.push([q.id, k, '判断题取值域外却判为可做']);
  // 未作答但参考答案缺失的题，必须落到"不可做"里
  if (!q.submitAnswer && !String(q.referenceAnswer || '').trim() && v.verifiable) problems.push([q.id, k, '无参考答案却判为可做']);
  if (q.questionType === 7 || q.questionType === 8) stat[k].noRef = (stat[k].noRef || 0) + (!String(q.referenceAnswer || '').trim() ? 1 : 0);
}
for (const [k, s] of Object.entries(stat).sort()) {
  console.log(`  ${k.padEnd(10)} 共 ${String(s.n).padStart(4)}  判为可自动作答 ${String(s.ok).padStart(4)}  不可做 ${String(s.n - s.ok).padStart(4)}`);
}
console.log(`\n不变式检查：${problems.length ? `✗ ${problems.length} 条可疑` : '✓ 没有一条把不该答的题放进可作答集合'}`);
for (const p of problems.slice(0, 12)) console.log('   ' + p[1] + ' | ' + p[2] + ' | id=' + String(p[0]).slice(0, 10));
if (problems.length > 12) console.log(`   …其余 ${problems.length - 12} 条略`);
