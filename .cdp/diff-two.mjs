// 逐字段 diff 两条视频：存储和显示Vue的数据-1(UI 未完成) vs -2(UI 已完成)，两边 API 都是 studyVideoStatus=2
//   node .cdp/diff-two.mjs
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
const A = '3159e08af4683e6e8736a9015ebcae9e';
const B = 'edc641a87345f3b54d9c2e9d48085f2a';
const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.log('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

const j = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t};const u=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const bs=await fetch('/gateway/system/orgStudent/listCourseBarrier?courseId=${CID}&majorId=${MID}&userId='+u.id+'&version=BK_RJGC_2024&studentCourseId=${SC}',{headers:H}).then(r=>r.json());
  let a=null,b=null;
  for(const bb of bs.data||[]){const ns=await fetch('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+bb.id+'&studentCourseId=${SC}',{headers:H}).then(r=>r.json());
    for(const n of ns.data||[]){if(n.videoId==='${A}')a=n;if(n.videoId==='${B}')b=n}}
  const pa=await fetch('/gateway/system/orgStudent/progressDetails?studentId='+u.id+'&id=${CID}&majorId=${MID}&studentCourseId=${SC}&version=BK_RJGC_2024',{headers:H}).then(r=>r.json());
  const hits={};
  (function w(ns){for(const n of ns||[]){for(const v of n.courseCatalogVideoVos||[]){if(v.videoId==='${A}'||v.videoId==='${B}')hits[v.videoId]=v}w(n.children)}})(pa.data);
  return JSON.stringify({a,b,hits})
})()`));

const fmt = (o) => JSON.stringify(o);
const keys = [...new Set([...Object.keys(j.a || {}), ...Object.keys(j.b || {})])];
console.log('=== listCatalogBarrier 两条视频逐字段对比 ===');
console.log('字段'.padEnd(30) + '| -1(UI未完成)'.padEnd(24) + '| -2(UI已完成)');
for (const k of keys) {
  const x = j.a?.[k], y = j.b?.[k];
  if (fmt(x) === fmt(y)) continue;
  if (['catalogName', 'name', 'id', 'videoId', 'path', 'sortCode', 'sortName', 'createTime', 'updateTime'].includes(k)) continue;
  console.log(k.padEnd(30) + '| ' + fmt(x)?.slice(0, 20).padEnd(22) + '| ' + fmt(y)?.slice(0, 40));
}
console.log('\n（其余字段两条完全相同）');
console.log('\n=== progressDetails 里两条各自的完整对象 ===');
for (const [vid, o] of Object.entries(j.hits || {})) console.log(vid.slice(0, 10) + ': ' + fmt(o).slice(0, 700));
if (!Object.keys(j.hits || {}).length) console.log('  progressDetails 里没有这两条的 videoId 键，改用 name 找：');
ws.close(); process.exit(0);
