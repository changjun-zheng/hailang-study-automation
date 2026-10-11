// 只探路由是否存在（发空请求看状态码），不上传任何文件
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const CAND = [
  '/gateway/file/studyRecordExercises/uploadCodeZip',
  '/gateway/study/file/studyRecordExercises/uploadCodeZip',
  '/gateway/frequent/file/studyRecordExercises/uploadCodeZip',
  '/gateway/system/file/studyRecordExercises/uploadCodeZip',
  '/gateway/study/studyRecordExercisesFile/uploadCodeZip',
  '/gateway/study/studyRecordExercises/uploadCodeZip',
  '/gateway/file/studyRecordExercises/getCodeZip',
  '/gateway/study/file/studyRecordExercises/getCodeZip',
  '/gateway/study/studyRecordExercisesFile/getCodeZip',
  '/gateway/study/file/cover/',
];
const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.url && t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };
const out = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t};
  const cand=${JSON.stringify(CAND)}; const res=[];
  for(const u of cand){
    const r=await fetch(u,{method:'POST',headers:H}).catch(e=>null);
    if(!r){res.push({u,http:'ERR'});continue}
    const tx=(await r.text()).replace(/\s+/g,' ');
    res.push({u,http:r.status,body:tx.slice(0,90)});
  }
  return JSON.stringify(res)
})()`));
console.log('空 POST 探路由（404=路由不存在；其它状态=存在但缺参数）:\n');
for (const r of out) {
  const exists = r.http !== 404;
  console.log(`  ${exists ? '✓' : '·'} ${String(r.http).padEnd(5)} ${r.u.replace('/gateway/', '').padEnd(52)} ${r.body.slice(0, 70)}`);
}
const found = out.filter((r) => r.http !== 404);
console.log(found.length ? '\n★ 存在的路由：\n  ' + found.map((f) => f.u + '  [' + f.body.slice(0, 60) + ']').join(String.fromCharCode(10, 2, 2)) : '\n全部 404');
