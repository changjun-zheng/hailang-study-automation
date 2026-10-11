// 把「已完成(status=2)」和「进行中(status=1)」两组视频的全部字段做差集，找除结果之外还有什么不同
//   node .cdp/diff-status.mjs
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
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.log('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

const rows = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t};const u=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const bs=await fetch('/gateway/system/orgStudent/listCourseBarrier?courseId=${CID}&majorId=${MID}&userId='+u.id+'&version=BK_RJGC_2024&studentCourseId=${SC}',{headers:H}).then(r=>r.json());
  const out=[];
  for(const b of (bs.data||[])){const ns=await fetch('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId=${SC}',{headers:H}).then(r=>r.json());
    for(const n of ns.data||[]) if(n.videoId) out.push(n)}
  return JSON.stringify(out)
})()`));

const groups = { s2: rows.filter((r) => r.studyVideoStatus === 2), s0: rows.filter((r) => r.studyVideoStatus === 0), s1: rows.filter((r) => r.studyVideoStatus === 1) };
console.log(`分组：status=2 → ${groups.s2.length} 条，status=0 → ${groups.s0.length} 条，status=1 → ${groups.s1.length} 条`);
const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
console.log('\n字段逐项对比（只列三组取值不完全一致的字段）：');
console.log('字段'.padEnd(30) + '| status=2 | status=0 | status=1');
for (const k of keys) {
  if (k === 'children' || k === 'courseCatalogVideoVos' || k === 'examAnswerVos') continue;
  const vals = (g) => [...new Set(g.map((r) => JSON.stringify(r[k])?.slice(0, 26)))];
  const a = vals(groups.s2), b = vals(groups.s0), c = vals(groups.s1);
  const same = JSON.stringify([a.sort(), b.sort(), c.sort()]) === JSON.stringify([a.sort(), a.sort(), a.sort()]) && a.length <= 1;
  if (same) continue;
  console.log(k.padEnd(30) + '| ' + a.join(',').slice(0, 20).padEnd(20) + '| ' + b.join(',').slice(0, 14).padEnd(14) + '| ' + c.join(',').slice(0, 24));
}
console.log('\n已完成的那几条到底是谁：');
for (const r of groups.s2) console.log(`  ${r.catalogName}  ${r.timeLength}s  studyMode=${r.studyMode}`);
console.log('\nstatus=0（有部分记录）的：');
for (const r of groups.s0) console.log(`  ${r.catalogName}  ${r.timeLength}s  studyMode=${r.studyMode}`);
console.log('\n每条视频的 studyMode 分布：');
console.log('  ' + JSON.stringify(rows.reduce((a, r) => ((a[r.studyMode] = (a[r.studyMode] || 0) + 1), a), {})));
ws.close(); process.exit(0);
