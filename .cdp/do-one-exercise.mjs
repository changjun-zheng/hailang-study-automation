// 单视频实验：做题 → 看服务端 studyVideoStatus 会不会翻成 2
// 先拿必填字段（空 body 靠校验反推），再发一条真答案，最后重读状态
//   node .cdp/do-one-exercise.mjs <视频名关键字> [--apply]
import fs from 'node:fs';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const KEY = process.argv[2] || '使用路由守卫-1';
const APPLY = process.argv.includes('--apply');
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
const OUT = process.cwd() + '/.cdp/do-one-exercise.txt';

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || '').slice(0, 240); return r.result?.value; };

const probe = await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const u=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(e=>({err:String(e)}));
  const G=(x)=>fetch(x,{headers:H}).then(r=>r.json()).catch(e=>({err:String(e)}));
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId=${CID}&majorId=${MID}&userId='+u.id+'&version=BK_RJGC_2024&studentCourseId=${SC}');
  let target=null;
  for(const b of bs.data||[]){const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId=${SC}');
    for(const n of ns.data||[]) if((n.catalogName||'')===${JSON.stringify(KEY)}) target={barrier:b.name,unitId:n.id,videoId:n.videoId,name:n.catalogName,secs:n.timeLength,st:n.studyVideoStatus}}
  if(!target) return JSON.stringify({err:'找不到这条视频'});
  const tree=await P('courseCatalog/tree',{courseId:'${CID}'});
  let nodes=[];(function w(n){if(!n)return;(n.childList||[]).forEach(w);if(n.id===target.unitId)nodes=(n.courseKnowledgeNodeGraphList||[]).map(k=>({id:k.id,businessId:k.businessId,name:k.name}))})(tree.data&&(Array.isArray(tree.data)?tree.data[0]:tree.data));
  const qs=[];
  for(const k of nodes){const l=await P('studyKnowledgeExerciseRecord/exercisesList',{knowledgeNodeId:k.id,studentCourseId:'${SC}',unitId:target.unitId});
    const arr=Array.isArray(l.data)?l.data:[];
    for(const q of arr) qs.push({k,q})}
  const rec=await G('/gateway/system/orgStudent/studyVideo?studentCourseId=${SC}&videoId='+target.videoId+'&studentId='+u.id+'&majorId=${MID}&version=BK_RJGC_2024');
  return JSON.stringify({target,nodes,qs:qs.map(x=>({knId:x.k.id,biz:x.k.businessId,knName:x.k.name,qid:x.q.id,type:x.q.questionType,ref:x.q.referenceAnswer,opts:(x.q.optionVos||[]).map(o=>({id:o.id,flag:o.answerFlag}))})),before:rec.data})
})()`);
const o = JSON.parse(probe);
if (o.err) { console.log(o.err); process.exit(1); }
console.log(`目标 = ${o.target.name} ${o.target.secs}s  studyVideoStatus=${o.target.st}  关卡=${o.target.barrier}`);
console.log(`  unit=${o.target.unitId}  video=${o.target.videoId}`);
console.log(`  知识点 ${o.nodes.length} 个，挂着的练习题 ${o.qs.length} 道`);
for (const q of o.qs) console.log(`    题型=${q.type} 题id=${q.qid} 知识点=${q.knName}(${q.biz}) 参考答案=${q.ref} 选项flag=${JSON.stringify(q.opts)}`);
const b = o.before || {};
console.log(`\n【基线】服务端记录：studyTime=${b.studyTime} startPos=${b.startPos} stopPos=${b.stopPos} maxCurrentPos=${b.maxCurrentPos} 记录id=${b.id}`);

if (!o.qs.length) { console.log('\n这条没挂练习，换一个目标'); process.exit(0); }

if (!APPLY) {
  console.log('\n（预览模式，没有提交任何东西。加 --apply 才真提交）');
  process.exit(0);
}

const res = await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const u=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(async r=>({http:r.status,body:await r.text()})).catch(e=>({http:0,body:String(e)}));
  const out=[];
  out.push(['空body探必填', await P('studyKnowledgeExerciseSummaryRecord/createList',{})]);
  const poList=${JSON.stringify(o.qs.map((q) => ({ submitAnswer: q.ref, exercisesId: q.qid, questionType: q.type, referenceAnswer: q.ref, recordId: null, segmentKnowledgeId: q.knId, updateCount: 0 })))};
  out.push(['正式提交', await P('studyKnowledgeExerciseSummaryRecord/createList',{poList,studentCourseId:'${SC}',studentId:u.id,courseId:'${CID}',videoId:'${o.target.videoId}',unitId:'${o.target.unitId}',majorId:'${MID}',version:'BK_RJGC_2024'})]);
  return JSON.stringify(out.map(([n,r])=>({n,http:r.http,body:String(r.body).slice(0,400)})))
})()`);
console.log('\n=== 提交结果 ===');
for (const r of JSON.parse(res)) console.log(`${r.n}: http=${r.http}\n  ${r.body}`);
fs.appendFileSync(OUT, `${new Date().toISOString()} ${o.target.name} ${JSON.stringify(JSON.parse(res))}\n`);

await new Promise((r) => setTimeout(r, 8000));
const after = await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t};const u=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const bs=await fetch('/gateway/system/orgStudent/listCourseBarrier?courseId=${CID}&majorId=${MID}&userId='+u.id+'&version=BK_RJGC_2024&studentCourseId=${SC}',{headers:H}).then(r=>r.json());
  let st=null;
  for(const b of bs.data||[]){const ns=await fetch('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId=${SC}',{headers:H}).then(r=>r.json());
    for(const n of ns.data||[]) if(n.videoId==='${o.target.videoId}') st={studyVideoStatus:n.studyVideoStatus,studyExerciseStatus:n.studyExerciseStatus}}
  const rec=await fetch('/gateway/system/orgStudent/studyVideo?studentCourseId=${SC}&videoId=${o.target.videoId}&studentId='+u.id+'&majorId=${MID}&version=BK_RJGC_2024',{headers:H}).then(r=>r.json());
  return JSON.stringify({st,rec:rec.data})
})()`);
const a = JSON.parse(after);
console.log(`\n【提交后】studyVideoStatus=${a.st && a.st.studyVideoStatus}（基线 ${o.target.st}）  studyExerciseStatus=${a.st && a.st.studyExerciseStatus}`);
console.log(`  记录：studyTime=${a.rec && a.rec.studyTime} startPos=${a.rec && a.rec.startPos} stopPos=${a.rec && a.rec.stopPos}`);
console.log(a.st && a.st.studyVideoStatus === 2 ? '\n★ 做题把这条翻成了已完成 —— 机制确认' : '\n✗ 状态没翻 —— 做题不改变视频完成态');
ws.close(); process.exit(0);
