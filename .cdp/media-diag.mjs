// 判定"媒体加载不出来"到底是哪一层：窗口可见性 / video 元素自身错误 / 直连 CDN 取一段字节
//   node .cdp/media-diag.mjs <study页URL>
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const U = process.argv[2];
const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(JSON.stringify(x.error))) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return { EXC: (r.exceptionDetails.exception?.description || '').slice(0, 200) }; return r.result?.value; };

const { windowId } = await send('Browser.getWindowForTarget', { targetId: page.id });
const b = await send('Browser.getWindowBounds', { windowId });
console.log('窗口:', JSON.stringify(b.bounds));
console.log('原生 hidden:', await evl(`Object.getOwnPropertyDescriptor(Document.prototype,'hidden').get.call(document)`));
if (U) { await send('Page.enable'); await send('Page.navigate', { url: U }); await new Promise((r) => setTimeout(r, 20000)); }
console.log('video 元素:', await evl(`(()=>{const v=document.querySelector('video');if(!v)return '无 video';return JSON.stringify({d:v.duration,rs:v.readyState,ns:v.networkState,cur:v.currentTime,err:v.error?v.error.code+':'+v.error.message:null,srcSet:!!(v.currentSrc||v.src),srcHost:(v.currentSrc||v.src||'').split('/')[2]||null})})()`));
console.log('页面自己取签名直链并试探（只报状态码，不打印 URL）:', await evl(`(async()=>{const t=localStorage.getItem('token2');const j=await fetch('/gateway/study/courseCloud/getVideoCloudUrl?path=dsep/res/video/e8716aab5bc18a56b115d3303f43555c/4e8259af10c558c29564e2df7809056e.mp4',{headers:{Authorization:t}}).then(r=>r.json());if(!j.data)return '签名接口没给 url code='+j.code;try{const r=await fetch(j.data,{method:'GET',headers:{Range:'bytes=0-1023'}});const bl=await r.arrayBuffer();return JSON.stringify({status:r.status,ok:r.ok,type:r.headers.get('content-type'),bytes:bl.byteLength})}catch(e){return '取字节失败:'+String(e).slice(0,140)}})()`));
ws.close(); process.exit(0);
