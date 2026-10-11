// 把整门课每条视频的服务端字段列成一张表，找「已完成 / 未完成」的真正分界
//   node .cdp/status-table.mjs
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
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.log('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

const raw = await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t};const u=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const bs=await fetch('/gateway/system/orgStudent/listCourseBarrier?courseId=${CID}&majorId=${MID}&userId='+u.id+'&version=BK_RJGC_2024&studentCourseId=${SC}',{headers:H}).then(r=>r.json());
  const rows=[];
  for(const b of (bs.data||[]).slice().sort((a,c)=>(a.sortCode||0)-(c.sortCode||0))){
    const ns=await fetch('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId=${SC}',{headers:H}).then(r=>r.json());
    for(const n of ns.data||[]) rows.push({barrier:b.name,node:n});
  }
  const prog=await fetch('/gateway/system/orgStudent/barrierStudyProgress?barrierId='+(bs.data[0].id)+'&studentCourseId=${SC}&version=BK_RJGC_2024',{headers:H}).then(r=>r.json()).catch(()=>null);
  return JSON.stringify({rows,firstBarrierProgress:prog&&prog.data})
})()`);
const { rows, firstBarrierProgress } = JSON.parse(raw);
const sec = (x) => { const s = String(x ?? ''); if (!s || s === 'null') return 0; return s.includes(':') ? s.split(':').reduce((a, b) => a * 60 + Number(b), 0) : Number(s) || 0; };
console.log('字段全集（第一条视频对象上的键）：\n  ' + Object.keys(rows[0].node).join(','));
console.log('\n第一关 barrierStudyProgress:', JSON.stringify(firstBarrierProgress).slice(0, 260));
console.log('\n关卡 | 条目 | 片长 | haveTime | videoStatus | 其它状态字段');
for (const { barrier, node: n } of rows) {
  if (!n.videoId && !/视频/.test(n.catalogName || '')) continue;
  const extra = Object.entries(n).filter(([k, v]) => /status|Status|finish|Finish|complete|Complete|learn|Learn|exer|Exer/.test(k) && v !== null && v !== undefined && typeof v !== 'object')
    .map(([k, v]) => `${k}=${v}`).join(' ');
  console.log(`${String(barrier).slice(0, 6).padEnd(7)} ${String(n.catalogName).slice(0, 26).padEnd(28)} ${String(n.timeLength).padStart(4)} ${String(n.haveTime || '—').padEnd(9)} ${String(n.studyVideoStatus).padStart(3)}  ${extra}`);
}
ws.close(); process.exit(0);
