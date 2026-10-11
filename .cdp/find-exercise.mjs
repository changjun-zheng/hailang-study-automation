// 找「已播过但未记账、且挂着知识点练习」的视频，并把它的服务端基线状态记下来
//   node .cdp/find-exercise.mjs
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.log('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 240)); process.exit(1); } return r.result?.value; };

const out = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const u=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const G=(x)=>fetch(x,{headers:H}).then(r=>r.json());
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId=${CID}&majorId=${MID}&userId='+u.id+'&version=BK_RJGC_2024&studentCourseId=${SC}');
  const res=[];
  for(const b of (bs.data||[])){
    const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId=${SC}');
    for(const n of (ns.data||[])){
      if(!n.videoId||n.studyVideoStatus===2) continue;
      const g=n.courseKnowledgeNodeGraphs||[];
      const segs=[];
      for(const k of g){ for(const s of (k.segmentVos||k.segments||k.children||[])) segs.push({kn:k.id||k.knowledgeNodeId||k.nodeId,seg:s.id||s.segmentId,segName:s.name||s.segmentName}); }
      res.push({barrier:b.name,name:n.catalogName,unitId:n.id,videoId:n.videoId,secs:n.timeLength,st:n.studyVideoStatus,graphKeys:g.length?Object.keys(g[0]).join(','):'',segs:segs.slice(0,6),graphLen:g.length});
    }
  }
  return JSON.stringify(res)
})()`));
console.log(`未完成的视频 ${out.length} 条。看它们的知识点图结构字段：`);
console.log('  graphKeys 样本:', out[0] ? out[0].graphKeys : '—', ' 有图的条数:', out.filter((r) => r.graphLen > 0).length);
const withGraph = out.filter((r) => r.graphLen > 0 && r.segs.length);
console.log(`\n有 segment 可挂练习的 ${withGraph.length} 条，最短的 6 条：`);
for (const r of withGraph.sort((a, b) => a.secs - b.secs).slice(0, 6)) {
  console.log(`  ${r.name} ${r.secs}s status=${r.st} 关卡=${r.barrier}`);
  console.log(`     unitId=${r.unitId} videoId=${r.videoId}`);
  for (const s of r.segs.slice(0, 3)) console.log(`     段 kn=${s.kn} seg=${s.seg} ${s.segName}`);
}
ws.close(); process.exit(0);
