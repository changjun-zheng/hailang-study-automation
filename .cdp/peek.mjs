// 只读看一眼当前 study 页面：URL、有没有「习题」入口、播放器状态
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const pages = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = pages.find((t) => t.url.includes('Study')) || pages.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); p.res(x.result); } };
const evl = async (expr) => (await new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } })); })).result?.value;
console.log('URL:', await evl('location.href'));
console.log('标题:', await evl('document.title'));
console.log('目录条目:', await evl(`(()=>{const a=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&/^\\s*(习题|视频)[:：]?/.test(e.textContent||'')&&(e.textContent||'').length<24);return a.slice(0,8).map(e=>JSON.stringify(e.textContent.trim().slice(0,20))).join(' ')||'（没找到）'})()`));
console.log('播放器:', await evl(`(()=>{const v=document.querySelector('video');return v?JSON.stringify({src:(v.currentSrc||v.src||'').slice(-46),t:Math.round(v.currentTime),d:Math.round(v.duration),paused:v.paused,muted:v.muted,rate:v.playbackRate}):'无 video 元素'})()`));
console.log('可见文案里的练习入口:', await evl(`(()=>{const t=document.body.innerText;const m=t.match(/[^\\n]*(习题|开始练习|已完成|未完成)[^\\n]*/g)||[];return [...new Set(m)].slice(0,10).join(' | ')})()`));
ws.close(); process.exit(0);
