// 量当前窗口的真实可见性：原生 visibilityState + 窗口 bounds + windowState
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(JSON.stringify(x.error))) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.value;

const { windowId } = await send('Browser.getWindowForTarget', { targetId: page.id });
const b = await send('Browser.getWindowBounds', { windowId });
console.log('窗口:', JSON.stringify(b.bounds));
console.log('原生 visibilityState:', await evl(`Object.getOwnPropertyDescriptor(Document.prototype,'visibilityState').get.call(document)`));
console.log('原生 document.hidden:', await evl(`Object.getOwnPropertyDescriptor(Document.prototype,'hidden').get.call(document)`));
console.log('hasFocus:', await evl('document.hasFocus()'));
console.log('video 元素数:', await evl(`document.querySelectorAll('video').length`));
console.log('播放器容器 class:', await evl(`(()=>{const v=document.querySelector('video');let p=v,s=[];for(let i=0;i<5&&p;i++){s.push(p.tagName+'.'+String(p.className).slice(0,40));p=p.parentElement}return s.join(' < ')})()`));
console.log('页面上的 .dplayer 节点数:', await evl(`document.querySelectorAll('[class*=dplayer]').length`));
ws.close(); process.exit(0);
