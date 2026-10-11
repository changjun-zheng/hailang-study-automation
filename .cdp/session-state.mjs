// 只读：当前 study 标签页的登录态与页面位置
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
console.log('标签页数=' + ps.length);
for (const p of ps) console.log('  ' + p.url.slice(0, 90));
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) process.exit(0);
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
const expr = `(()=>{const u=JSON.parse(localStorage.getItem('userInfo2')||'{}');return JSON.stringify({url:location.href.slice(0,70),lsKeys:Object.keys(localStorage).filter(k=>/token|user/i.test(k)),tokenLen:(localStorage.getItem('token2')||'').length,userId:u.id||null,bodyHint:(document.body.innerText||'').replace(/\\s+/g,' ').slice(0,120)})})()`;
const r = await new Promise((res) => { ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id === 7) res(x); }; ws.send(JSON.stringify({ id: 7, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } })); });
if (!r.result || !r.result.value) { console.log('原始响应:', JSON.stringify(r).slice(0, 400)); process.exit(0); }
const o = JSON.parse(r.result.value);
console.log('URL:', o.url);
console.log('localStorage 里的键:', o.lsKeys.join(', ') || '（没有 token/user 相关键）');
console.log('token2 长度:', o.tokenLen, ' userId:', o.userId);
console.log('页面文字:', o.bodyHint);
ws.close(); process.exit(0);
