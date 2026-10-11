// 从 courseCatalog/tree 里把「视频 → 知识点 → 练习」这条链取出来，挑一条未记账且有练习的视频
//   node .cdp/map-exercise.mjs
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.log('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 240)); process.exit(1); } return r.result?.value; };

const out = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const P=(u,b)=>fetch('/gateway/study/'+u,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json());
  const tree=await P('courseCatalog/tree',{courseId:'${CID}'});
  const vids=[];
  (function w(n){ if(!n) return; (n.childList||[]).forEach(w);
    for(const k of (n.courseKnowledgeNodeGraphList||[])) vids.push({unit:n.id,unitName:n.name,knId:k.id,businessId:k.businessId,name:k.name,keys:Object.keys(k).join(',')});
  })(tree.data&&(Array.isArray(tree.data)?tree.data[0]:tree.data));
  const byVid={};
  for(const v of vids){ (byVid[v.businessId]=byVid[v.businessId]||[]).push(v) }
  const bs=await fetch('/gateway/system/orgStudent/listCourseBarrier?courseId=${CID}&majorId=${MID}&userId='+JSON.parse(localStorage.getItem('userInfo2')).id+'&version=BK_RJGC_2024&studentCourseId=${SC}',{headers:H}).then(r=>r.json());
  const rows=[];
  for(const b of (bs.data||[])){
    const ns=await fetch('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId=${SC}',{headers:H}).then(r=>r.json());
    for(const n of (ns.data||[])){
      if(!n.videoId||n.studyVideoStatus===2) continue;
      const kns=byVid[n.videoId]||[];
      let qs=0;
      for(const k of kns){ const l=await P('studyKnowledgeExerciseRecord/exercisesList',{knowledgeNodeId:k.knId,studentCourseId:'${SC}',unitId:n.id}); if(Array.isArray(l.data)) qs+=l.data.length; }
      if(kns.length||qs) rows.push({barrier:b.name,name:n.catalogName,unitId:n.id,videoId:n.videoId,secs:n.timeLength,st:n.studyVideoStatus,knCount:kns.length,kn:kns.slice(0,3).map(k=>k.knId),qs});
    }
  }
  return JSON.stringify({treeNodes:vids.length,rows})
})()`));
console.log(`tree 里共有 ${out.treeNodes} 个知识点节点；未记账且挂练习/知识点的视频 ${out.rows.length} 条：`);
for (const r of out.rows.sort((a, b) => a.secs - b.secs).slice(0, 10)) {
  console.log(`  ${r.name} ${r.secs}s status=${r.st} 知识点${r.knCount}个 练习题${r.qs}道  关卡=${r.barrier}`);
  console.log(`     unit=${r.unitId} video=${r.videoId} kn=${(r.kn || []).join(',')}`);
}
ws.close(); process.exit(0);
