// 导出课程练习题库（题干 + 题型 + 分值 + 平台下发的参考答案），供练习投放后直接作答
//   node export-exercises.mjs [--course 软件系统分析与设计] [--out exercises.json]
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const fs = await import('node:fs');
const path = await import('node:path');
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const COURSE = arg('--course', '软件系统分析与设计');
const OUT = arg('--out', 'exercises-' + COURSE + '.json');
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));

const pages = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const tab = pages.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!tab) {
  console.error('9224 上没有 study 页面');
  process.exit(1);
}
let seq = 0;
const inflight = new Map();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(new Error('ws 失败'));
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
await send('Runtime.enable');
const evl = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || '').slice(0, 200));
  return r.result?.value;
};

const TYPE = { 1: '单选题', 2: '多选题', 3: '判断题', 4: '填空题', 5: '简答题', 6: '问答题', 7: '编程题', 8: '设计题', 9: '框架编程题', 10: 'WPS操作题' };
const OBJECTIVE = new Set([1, 2, 3]);

const raw = await evl(`(async()=>{
  const H={Authorization:localStorage.getItem('token2'),'Content-Type':'application/json'};
  const me=(JSON.parse(localStorage.getItem('userInfo2')||'{}').id)||'';
  const cs=await (await fetch('/gateway/frequent/orgStudent/pagedMyCourse',{method:'POST',headers:H,body:JSON.stringify({filters:{courseNature:null,name:'',schoolYear:'',studentId:me,term:'',courseFlag:0},pageIndex:1,pageSize:50})})).json();
  const c=((cs.data&&(cs.data.records||cs.data.list))||[]).find(x=>x.name===${JSON.stringify(COURSE)});
  if(!c) return JSON.stringify({err:'没找到课程'});
  const ex=await (await fetch('/gateway/frequent/orgStudentCourse/myExercises',{method:'POST',headers:H,body:JSON.stringify({filters:{courseId:c.id,studentId:me},pageIndex:1,pageSize:100})})).json();
  const recs=(ex.data&&(ex.data.list||ex.data.records))||[];
  return JSON.stringify({course:c,recs:recs.map(r=>({catalogName:r.catalogName,unitId:r.unitId,statusName:r.statusName,sumScore:r.sumScore,cfg:r.courseCatalogExercisesConfig||[]}))});
})()`);

const parsed = JSON.parse(raw);
if (parsed.err) {
  console.error(parsed.err);
  process.exit(1);
}
const units = parsed.recs.map((r) => ({
  单元: r.catalogName,
  unitId: r.unitId,
  状态: r.statusName,
  总分: r.sumScore,
  题目: r.cfg.map((e) => ({
    exerciseId: e.exerciseId,
    题型: TYPE[e.questionType] || String(e.questionType),
    questionType: e.questionType,
    分值: e.score,
    题干: String(e.content || '').replace(/<[^>]+>/g, '').trim(),
    参考答案: e.referenceAnswer,
    答案格式: OBJECTIVE.has(e.questionType) ? (e.questionType === 3 ? '0/1 直接作为 submitAnswer' : '选项ID，多选用 | 分隔') : '非客观题，需人工作答',
    可自动作答: OBJECTIVE.has(e.questionType),
    解析: String(e.thinking || '').replace(/<[^>]+>/g, '').trim(),
  })),
}));
const all = units.flatMap((u) => u.题目);
const obj = all.filter((q) => q.可自动作答).length;
fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify({ 课程: parsed.course.name, 导出时间: new Date().toISOString(), 单元数: units.length, 题目总数: all.length, 客观题: obj, 非客观题: all.length - obj, 单元: units }, null, 1));
console.log(`已导出 ${OUT}：${units.length} 个单元 / ${all.length} 道题（客观 ${obj}、非客观 ${all.length - obj}）`);
for (const u of units) console.log(`  ${u.单元}: ${u.题目.length} 道，状态=${u.状态}，总分=${u.总分}`);
ws.close();
process.exit(0);
