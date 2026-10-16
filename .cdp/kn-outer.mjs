// 探针：把候选字段名放在【外层】（不是 poList 元素里），用 Jackson 类型错问出
// studyKnowledgeExerciseSummaryRecord/createList 到底在哪一层收 segment 知识点 id。
// 天然不落库：字段名错 → 未知字段被忽略 → 插入因缺列报错；字段名对 → 类型错，压根进不到 SQL。
//   node .cdp/kn-outer.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
const UNIT = '6814946beba252b0ae35bf229d454ae7';
const VID = '3159e08af4683e6e8736a9015ebcae9e';

const all = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && t.url.includes('study.cqie.edu.cn'));
let KEEP = null; try { KEEP = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id; } catch {}
const full = all.find((t) => t.id === KEEP) || all[0];
const ws = new WebSocket(full.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', String(r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

const NAMES = ['segmentKnowledgeId', 'knowledgeNodeId', 'knowledgeId', 'segmentId', 'videoSegmentKnowledgeId', 'nodeId', 'id', 'summaryRecord'];
const expr = `(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const post=(b)=>fetch('/gateway/study/studyKnowledgeExerciseSummaryRecord/createList',{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.text()).catch(e=>'ERR'+e);
  const out=[];
  const item={submitAnswer:'0',exercisesId:'probe-nonexistent-id',questionType:3,referenceAnswer:'0',recordId:null,updateCount:0};
  for(const n of ${JSON.stringify(NAMES)}){
    const b={};b[n]={};
    const body={...b,poList:[item],studentCourseId:'${SC}',studentId:me.id,courseId:'${CID}',videoId:'${VID}',unitId:'${UNIT}',majorId:'${MID}',version:'BK_RJGC_2024'};
    const txt=String(await post(body)).replace(/\\s+/g,' ');
    out.push({n,hit:/JSON parse error|MismatchedInput/.test(txt),head:txt.slice(0,110)});
  }
  // 再来一轮：把 exercisesId 换成真实存在的题目 id（从 exercisesList 取），看外层带 segmentKnowledgeId 能否成功
  const l=await fetch('/gateway/study/studyKnowledgeExerciseRecord/exercisesList',{method:'POST',headers:H,body:JSON.stringify({knowledgeNodeId:'7c95f99852bad83f3e3e1d6d39153cde',studentCourseId:'${SC}',unitId:'${UNIT}'})}).then(r=>r.json());
  const q=(Array.isArray(l.data)?l.data:[])[0]||null;
  const real={};
  if(q){
    // 试 element 里放 id=分段id（上一轮探针证明 element 只有 id 是真字段）
    const b1={poList:[{submitAnswer:String(q.referenceAnswer||''),exercisesId:q.id,questionType:q.questionType,referenceAnswer:q.referenceAnswer,recordId:null,id:'7c95f99852bad83f3e3e1d6d39153cde',updateCount:0}],studentCourseId:'${SC}',studentId:me.id,courseId:'${CID}',videoId:'${VID}',unitId:'${UNIT}',majorId:'${MID}',version:'BK_RJGC_2024'};
    real.elementIdIsSeg=String(await post(b1)).replace(/\\s+/g,' ').slice(0,200);
    const b2={poList:[{submitAnswer:String(q.referenceAnswer||''),exercisesId:q.id,questionType:q.questionType,referenceAnswer:q.referenceAnswer,recordId:null,updateCount:0}],segmentKnowledgeId:'7c95f99852bad83f3e3e1d6d39153cde',studentCourseId:'${SC}',studentId:me.id,courseId:'${CID}',videoId:'${VID}',unitId:'${UNIT}',majorId:'${MID}',version:'BK_RJGC_2024'};
    real.outerSeg=String(await post(b2)).replace(/\\s+/g,' ').slice(0,200);
    real.qid=q.id; real.qtype=q.questionType;
  }
  return JSON.stringify({out,real})
})()`;

const o = JSON.parse(await evl(expr));
console.log('外层字段探针（✓ = 该名字是外层真实字段，Jackson 报类型错）：');
for (const r of o.out) console.log(`  ${r.hit ? '✓' : '·'} ${r.n.padEnd(26)} ${r.head}`);
console.log('\n两种可行形状的真实返回（用真题目 id）：');
console.log('  element.id=分段id  :', String(o.real.elementIdIsSeg).slice(0, 220));
console.log('  外层 segmentKnowledgeId:', String(o.real.outerSeg).slice(0, 220));
ws.close(); process.exit(0);
