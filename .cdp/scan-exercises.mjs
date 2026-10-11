// 扫全部未记账视频：每条属于哪个单元、单元下有几个知识点、知识点上挂了几道练习、都是什么题型
//   node .cdp/scan-exercises.mjs
import fs from 'node:fs';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
const OUT = process.cwd() + '/.cdp/exercise-map.json';
const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.log('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 240)); process.exit(1); } return r.result?.value; };

const res = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const u=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(()=>({}));
  const G=(x)=>fetch(x,{headers:H}).then(r=>r.json()).catch(()=>({}));
  const tree=await P('courseCatalog/tree',{courseId:'${CID}'});
  const unitNodes={};
  (function w(n){if(!n)return;(n.childList||[]).forEach(w);unitNodes[n.id]=(n.courseKnowledgeNodeGraphList||[]).map(k=>({id:k.id,biz:k.businessId,name:k.name}))})(tree.data&&(Array.isArray(tree.data)?tree.data[0]:tree.data));
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId=${CID}&majorId=${MID}&userId='+u.id+'&version=BK_RJGC_2024&studentCourseId=${SC}');
  const rows=[];
  for(const b of bs.data||[]){
    const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId=${SC}');
    for(const n of ns.data||[]){
      if(!n.videoId) continue;
      const nodes=unitNodes[n.id]||[];
      const qs=[];
      for(const k of nodes){const l=await P('studyKnowledgeExerciseRecord/exercisesList',{knowledgeNodeId:k.biz,studentCourseId:'${SC}',unitId:n.id});
        for(const q of (Array.isArray(l.data)?l.data:[])) qs.push({knId:k.id,biz:k.biz,knName:k.name,qid:q.id,type:q.questionType,ref:q.referenceAnswer,ans:q.submitAnswer,st:q.studyExerciseStatus,opts:(q.optionVos||[]).map(o=>({id:o.id,flag:o.answerFlag}))})}
      rows.push({barrier:b.name,name:n.catalogName,unitId:n.id,videoId:n.videoId,secs:n.timeLength,st:n.studyVideoStatus,exSt:n.studyExerciseStatus,nodeCount:nodes.length,qs});
    }
  }
  return JSON.stringify(rows)
})()`));
fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
const withQ = res.filter((r) => r.qs.length);
console.log(`全课 ${res.length} 条视频；其中所在单元挂着练习的 ${withQ.length} 条，练习题合计 ${res.reduce((a, r) => a + r.qs.length, 0)} 道`);
console.log(`\n未记账(st!=2)且所在单元有练习的：`);
let n = 0;
for (const r of withQ.filter((x) => x.st !== 2)) {
  const open = r.qs.filter((q) => !q.ans);
  console.log(`  ${r.name} ${r.secs}s st=${r.st} 练习${r.qs.length}道(未答${open.length}) 题型=${[...new Set(r.qs.map((q) => q.type))].join('/')} 关卡=${r.barrier}`);
  if (n++ < 2) for (const q of r.qs.slice(0, 3)) console.log(`      q=${q.qid.slice(0, 10)} type=${q.type} ref=${String(q.ref).slice(0, 40)} 已答=${q.ans || '无'} flags=${JSON.stringify(q.opts.map((o) => o.flag))}`);
}
console.log(`\n明细已存 .cdp/exercise-map.json`);
ws.close(); process.exit(0);
