// 探 uploadCodeZip 的 multipart 字段名：故意只发一个普通表单字段（不带文件），
// 让 Spring 把必填的 part 名报出来。这一步不会真的上传任何文件。
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.url && t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };
const out = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');
  const EP='/gateway/file/studyRecordExercises/uploadCodeZip';
  const res=[];
  const fd=new FormData(); fd.append('studentCourseId','2c235454cef7b898bd11e77ad2b0d20c');
  let r=await fetch(EP,{method:'POST',headers:{Authorization:t},body:fd});
  res.push({tag:'只带普通字段',http:r.status,body:(await r.text()).replace(/\s+/g,' ').slice(0,220)});
  const fd2=new FormData(); fd2.append('file',new Blob(['hello'],{type:'application/zip'}),'t.zip');
  r=await fetch(EP,{method:'POST',headers:{Authorization:t},body:fd2});
  res.push({tag:'带 file 字段',http:r.status,body:(await r.text()).replace(/\s+/g,' ').slice(0,260)});
  return JSON.stringify(res)
})()`));
for (const r of out) console.log(`\n【${r.tag}】http=${r.http}\n  ${r.body}`);
