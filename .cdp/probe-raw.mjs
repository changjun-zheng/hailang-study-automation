// 看 codeHtmlRun/submitMultiCode 对几种 body 的原始响应，判定"数组走不同分支"是真线索还是假象
//   node .cdp/probe-raw.mjs
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.url && t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

const BODIES = ['[]', JSON.stringify([{ fileName: 'index.html', content: '<html>x</html>' }]), '{}', JSON.stringify({ fileList: [{ fileName: 'index.html', content: '<html>x</html>' }] })];
const out = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const bodies=${JSON.stringify(BODIES)};
  const res=[];
  for(const b of bodies){
    const r=await fetch('/gateway/code/codeHtmlRun/submitMultiCode',{method:'POST',headers:H,body:b}).catch(e=>null);
    if(!r){res.push({b,http:'ERR'});continue}
    const tx=await r.text();
    res.push({b:b.slice(0,46),http:r.status,ct:(r.headers.get('content-type')||'').slice(0,26),head:tx.slice(0,3000)});
  }
  return JSON.stringify(res)
})()`));
for (const r of out) {
  console.log(`\nbody = ${r.b}`);
  console.log(`  http=${r.http} ct=${r.ct}`);
  console.log(`  响应: ${String(r.head).replace(/\s+/g, ' ')}`);
}
ws.close(); process.exit(0);
