// 把 study 标签页所在窗口设成指定状态（normal / minimized / maximized）
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const STATE = process.argv[2] || 'normal';
const L = Number(process.argv[3]), T = Number(process.argv[4]), W = Number(process.argv[5]), H = Number(process.argv[6]);
const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(JSON.stringify(x.error))) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const { windowId } = await send('Browser.getWindowForTarget', { targetId: page.id });
const bounds = { windowState: STATE };
if (!Number.isNaN(L)) Object.assign(bounds, { left: L, top: T, width: W, height: H });
await send('Browser.setWindowBounds', { windowId, bounds });
await new Promise((r) => setTimeout(r, 1500));
const b = await send('Browser.getWindowBounds', { windowId });
console.log('窗口现在是:', JSON.stringify(b.bounds));
console.log('原生 hidden:', await (async () => { const r = await send('Runtime.evaluate', { expression: `Object.getOwnPropertyDescriptor(Document.prototype,'hidden').get.call(document)`, returnByValue: true }); return r.result?.value; })());
ws.close(); process.exit(0);
