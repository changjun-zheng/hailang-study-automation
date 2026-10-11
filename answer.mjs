// 用已验证可用的提交接口做答：studyRecordQuestionError/correct
//   node answer.mjs            只预览（不写任何数据）
//   node answer.mjs --apply    真正提交
// 答案来源：questionDetails 的 optionVos[].answerFlag==1 与 referenceAnswer 双证一致才提交
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const fs = await import('node:fs');
const path = await import('node:path');
const has = (n) => process.argv.includes(n);
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const APPLY = has('--apply');
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const STUDENT_ID = arg('--studentId', 'YOUR_STUDENT_ID');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

const pages = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
let runnerId = null;
try {
  runnerId = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id;
} catch (e) {}
const tab = pages.find((t) => t.url.includes('study.cqie.edu.cn') && t.id !== runnerId);
if (!tab) {
  console.error('没有空闲标签页（runner 独占的那个已排除）');
  process.exit(1);
}
let seq = 0;
const inflight = new Map();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(new Error('CDP ws 失败'));
  ws.onmessage = (m) => {
    const x = JSON.parse(m.data);
    if (x.id && inflight.has(x.id)) {
      const p = inflight.get(x.id);
      inflight.delete(x.id);
      x.error ? p.rej(new Error(x.error.message)) : p.res(x.result);
    }
  };
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    inflight.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evl = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'eval 异常').slice(0, 200));
  return r.result?.value;
};
const api = (url, body) =>
  evl(`fetch(${JSON.stringify(url)}, {method:'POST', headers:{Authorization: localStorage.getItem('token2'),'Content-Type':'application/json'}, body: ${JSON.stringify(JSON.stringify(body))}}).then(r=>r.text())`).then((t) => JSON.parse(t));

if (!tab.url.includes('study.cqie.edu.cn')) {
  await send('Page.navigate', { url: 'https://study.cqie.edu.cn/stu/home' });
  await sleep(9000);
}

const mk = await api('/gateway/study/studyRecordQuestionError/clientPaged', { filters: { studentId: STUDENT_ID }, pageIndex: 1, pageSize: 100 });
const recs = (mk.data && (mk.data.list || mk.data.records)) || [];
const todo = recs.filter((r) => r.status === 0);
log(`错题 ${recs.length} 条，其中未订正 ${todo.length} 条${APPLY ? ' —— 将提交' : ' —— 仅预览，不写数据'}`);

let submitted = 0, skipped = 0;
for (const r of todo) {
  const d = await api('/gateway/study/studyRecordQuestionError/questionDetails', { exercisesId: r.exercisesId });
  const q = d.data || {};
  const opts = q.optionVos || [];
  const ref = String(q.referenceAnswer || '').split('|').filter(Boolean);
  const text = (s) => String(s || '').replace(/<[^>]+>/g, '').trim();
  let answer = null, basis = '';
  if (q.questionType === 3) {
    // 判断题没有选项数组，答案就是 referenceAnswer 本身（'0'/'1'）
    if (ref.length === 1 && /^[01]$/.test(ref[0])) {
      answer = ref[0];
      basis = `判断题 referenceAnswer=${ref[0]}（${ref[0] === '1' ? '正确' : '错误'}）`;
    }
  } else {
    const correct = opts.filter((o) => o.answerFlag === 1).map((o) => o.id);
    const refMatch = ref.length ? ref.every((x) => correct.includes(x)) : true;
    if (correct.length && refMatch) {
      answer = correct.join('|');
      basis = `answerFlag=1 共 ${correct.length} 项，与 referenceAnswer 一致`;
    } else {
      log(`  跳过（答案不自洽）：${text(r.content).slice(0, 28)} | answerFlag=${correct.length} reference=${ref.length}`);
      skipped++;
      continue;
    }
  }
  log(`  ${text(r.content).slice(0, 40)}`);
  log(`    课程=${r.courseName} 题型=${r.questionTypeName} 依据=${basis}`);
  log(`    将提交 submitAnswer=${answer}`);
  if (!APPLY) {
    skipped++;
    continue;
  }
  const res = await api('/gateway/study/studyRecordQuestionError/correct', { exercisesId: r.exercisesId, submitAnswer: answer, recordId: r.recordId });
  log(`    → code${res.code} ${res.msg}`);
  if (res.code === 200) submitted++;
  await sleep(800);
}
log(`${APPLY ? '已提交 ' + submitted + ' 条' : '预览模式：未提交'}；跳过 ${skipped} 条`);
ws.close();
process.exit(0);
