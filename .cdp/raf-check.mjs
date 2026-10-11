// headless 下量三件事：真实可见性、requestAnimationFrame 有没有在跑、站点自己发不发写请求
//   node .cdp/raf-check.mjs [观察秒数]
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const SECS = Number(process.argv[2] || 60);
const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map(); const writes = [];
ws.onmessage = (e) => {
  const x = JSON.parse(e.data);
  if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); return; }
  if (x.method === 'Network.requestWillBeSent') {
    const q = x.params.request; const u = decodeURIComponent(q.url);
    if (u.includes('/gateway/') && !u.includes('/gateway/static/') && !/progressDetails|myCourseDetails|practiceNotePaged|courseCatalog\/tree|getVideoCloudUrl|studyVideo\?/.test(u)) writes.push(`${new Date().toTimeString().slice(0, 8)} ${q.method} ${u.replace('https://study.cqie.edu.cn', '').slice(0, 110)}${q.postData ? '  BODY=' + q.postData.slice(0, 320) : ''}`);
  }
};
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || '').slice(0, 160); return r.result?.value; };
await send('Page.enable'); await send('Network.enable'); await send('Runtime.enable');

console.log('UA:', await evl('navigator.userAgent'));
console.log('原生 visibilityState:', await evl(`Object.getOwnPropertyDescriptor(Document.prototype,'visibilityState').get.call(document)`));
console.log('原生 hidden:', await evl(`Object.getOwnPropertyDescriptor(Document.prototype,'hidden').get.call(document)`));

// 不注入油猴脚本，先让站点自己的逻辑跑：起播靠 autoplay 参数
await evl(`(()=>{const v=document.querySelector('video');if(v){v.muted=true;v.play().catch(()=>{})}})()`);
await new Promise((r) => setTimeout(r, 6000));
console.log('起播:', await evl(`(()=>{const v=document.querySelector('video');return v?JSON.stringify({t:+v.currentTime.toFixed(1),d:Math.round(v.duration),paused:v.paused}):'无'})()`));

const n0 = await evl(`(()=>{window.__raf=0;(function l(){window.__raf++;requestAnimationFrame(l)})()})() && '已挂计数'`);
writes.length = 0;
console.log(n0, `观察 ${SECS} 秒…`);
for (let i = 1; i <= SECS / 10; i++) {
  await new Promise((r) => setTimeout(r, 10000));
  const s = JSON.parse((await evl(`(()=>{const v=document.querySelector('video');return JSON.stringify({t:v?+v.currentTime.toFixed(1):null,raf:window.__raf})})()`)) || '{}');
  console.log(`  +${i * 10}s  video.currentTime=${s.t}  rAF 累计=${s.raf}`);
}
console.log('\n这段时间站点自己发出的写请求 ' + writes.length + ' 条：');
for (const w of writes.slice(0, 12)) console.log('  ' + w);
ws.close(); process.exit(0);
