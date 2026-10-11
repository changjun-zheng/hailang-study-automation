// 验「做完知识练习之后，服务端到底改了什么」：课程总进度 + 该单元每条视频状态 + 该知识点的作答记录
//   node .cdp/verify-exercise.mjs [knowledgeNodeId] [unitId] [videoId]
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const KN = process.argv[2] || 'b8cab73175f52742976d8469c56a64b6';
const UNIT = process.argv[3] || '43004df89e9325e5d3cbd659af64c720';
const VID = process.argv[4] || 'cc9315861dfd204696788ac805523eec';
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
const SNAP = path.join(ROOT, '.cdp', 'verify-exercise-snapshot.json');

const pages = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = pages.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval 异常'); return r.result.value; };

const P = JSON.stringify;
const probe = `(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const G=(u,o)=>fetch(u,o).then(r=>r.json()).catch(e=>({err:String(e)}));
  const J=(u,b)=>G('/gateway/study/'+u,{method:'POST',headers:H,body:JSON.stringify(b)});
  const out={};
  out.progress = await G('/gateway/system/orgStudent/progressDetails?studentId='+String(JSON.parse(localStorage.getItem('userInfo2')||'{}').id)+'&id='+${P(CID)}+'&majorId='+${P(MID)}+'&studentCourseId='+${P(SC)}+'&version=BK_RJGC_2024',{headers:H});
  out.unitVideos = await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+${P(UNIT)}+'&studentCourseId='+${P(SC)}, {headers:H});
  out.knList = await J('studyKnowledgeExerciseRecord/exercisesList',{knowledgeNodeId:${P(KN)},studentCourseId:${P(SC)},unitId:${P(UNIT)}});
  out.knCheck = await J('studyKnowledgeExerciseRecord/check',{segmentKnowledgeId:${P(KN)},studentCourseId:${P(SC)},studentId:'YOUR_STUDENT_ID',videoId:${P(VID)}});
  out.catCheck = await J('/courseCatalogKnowledgeExercise/checkUpdateExercises',{knowledgeNodeId:${P(KN)},studentCourseId:${P(SC)},unitId:${P(UNIT)}});
  return JSON.stringify(out);
})()`;

const o = JSON.parse(await evl(probe));
fs.writeFileSync(SNAP, JSON.stringify(o, null, 1));

const fmt = (s) => { s = Number(s) || 0; const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return `${h}:${String(m).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`; };
const sec = (x) => { if (x === null || x === undefined || x === '') return 0; const s = String(x); if (s.includes(':')) return s.split(':').reduce((a, b) => a * 60 + Number(b), 0); return Number(s) || 0; };
const pd = o.progress && o.progress.data;
console.log('课程进度接口 code=' + (o.progress && o.progress.code));
if (pd) {
  let sum = 0, tot = 0, done = 0, all = 0;
  (function w(ns) { for (const n of ns || []) { for (const v of n.courseCatalogVideoVos || []) { all++; tot += sec(v.timeLength); if (sec(v.haveTime) > 0) { sum += sec(v.haveTime); done++; } } w(n.children); } })(Array.isArray(pd) ? pd : pd.courseCatalogVos || pd.records || []);
  console.log(`  视频 ${done}/${all} 条有 haveTime，累计 ${fmt(sum)} / 总时长 ${fmt(tot)}`);
  const KEY = process.env.UNIT_KEY || '构建Vue的应用实例';
  console.log(`\n进度树里名字含「${KEY}」的节点：`);
  (function w(ns, depth) {
    for (const n of ns || []) {
      if ((n.name || n.catalogName || '').includes(KEY)) {
        console.log(`  [${depth}] ${n.name || n.catalogName}  id=${n.id || n.courseId || '-'}`);
        for (const v of n.courseCatalogVideoVos || []) console.log(`      ${String(v.name).slice(0, 24).padEnd(26)} len=${v.timeLength} haveTime=${v.haveTime}${sec(v.haveTime) === sec(v.timeLength) && sec(v.timeLength) > 0 ? '  ← 播满' : ''}`);
      }
      w(n.children, depth + 1);
    }
  })(Array.isArray(pd) ? pd : pd.courseCatalogVos || pd.records || [], 0);
}
const uv = (o.unitVideos && o.unitVideos.data) || [];
console.log(`\n单元 ${UNIT.slice(0, 8)} 的目录条目 ${uv.length} 个：`);
for (const n of uv) {
  console.log(`  ${String(n.catalogName).slice(0, 26).padEnd(28)} videoId=${n.videoId ? n.videoId.slice(0, 10) : '-'} status=${n.studyVideoStatus} haveTime=${n.haveTime} len=${n.timeLength}`);
}
const kl = o.knList && o.knList.data;
console.log(`\n知识练习 exercisesList → code=${o.knList && o.knList.code} msg=${String(o.knList && o.knList.msg).slice(0, 40)}`);
for (const q of (Array.isArray(kl) ? kl : [])) {
  const right = (q.optionVos || []).filter((x) => x.answerFlag === 1).map((x) => x.id);
  const sub = String(q.submitAnswer || '').split(',').filter(Boolean);
  const same = right.length && right.length === sub.length && right.every((r) => sub.includes(r));
  console.log(`  题干=${String(q.content).slice(0, 30)}  题型=${q.questionType}  studyExerciseStatus=${q.studyExerciseStatus}  recordId=${q.recordId}`);
  console.log(`  referenceAnswer=${q.referenceAnswer}  submitAnswer=${q.submitAnswer}  选项answerFlag集合一致=${same ? '一致(答对)' : '不一致'}`);
}
if (!Array.isArray(kl) || !kl.length) console.log('  ' + JSON.stringify(kl).slice(0, 300));
const kc = o.knCheck && o.knCheck.data;
console.log(`\n知识练习 check → code=${o.knCheck && o.knCheck.code} data=${typeof kc === 'object' ? JSON.stringify(kc).slice(0, 260) : kc}`);
console.log(`目录 checkUpdateExercises → code=${o.catCheck && o.catCheck.code} data=${JSON.stringify(o.catCheck && o.catCheck.data).slice(0, 160)}`);
console.log('\n完整响应已存 .cdp/verify-exercise-snapshot.json');
ws.close(); process.exit(0);
