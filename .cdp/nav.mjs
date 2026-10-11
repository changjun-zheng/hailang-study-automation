// 把当前 study 标签页导航到指定 URL（headless 下也管用），并等媒体加载出来
//   node .cdp/nav.mjs <URL>
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const U = process.argv[2];
if (!U || !U.startsWith('http')) { console.error('用法: node .cdp/nav.mjs <URL>'); process.exit(1); }
const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
let page = ps.find((t) => t.url.includes('study.cqie.edu.cn')) || ps[0];
if (!page) { console.error('没有任何标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC'; return r.result?.value; };
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: U });
await new Promise((r) => setTimeout(r, 18000));
console.log('URL:', String(await evl('location.href')).slice(0, 100));
console.log('播放器:', await evl(`(()=>{const v=document.querySelector('video');return v?JSON.stringify({d:(v.duration||0)?Math.round(v.duration):null,paused:v.paused}):'无 video'})()`));
console.log('登录态 token2 长度:', await evl(`(localStorage.getItem('token2')||'').length`));
ws.close(); process.exit(0);
