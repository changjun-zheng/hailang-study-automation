// 抓「站点在离开一条视频时到底发了什么」：完整 body，不截断。
// 顺带验一件事：可见窗口里目录合成点击是不是真的能切（headless 下不能）。
//   node .cdp/capture-plan.mjs <要播的视频URL> <要点开的目录条目名> [播放观察秒数]
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const URLA = process.argv[2];
const TARGET = process.argv[3] || '使用两种方式实现路由参数传递-1';
const WATCH = Number(process.argv[4] || 25) * 1000;
const OUT = path.join(ROOT, '.cdp', 'plan-chain.txt');
if (!URLA) { console.error('用法: node .cdp/capture-plan.mjs <视频页URL> <目录条目名> [秒]'); process.exit(1); }

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map(); const inflight = new Map(); const rows = [];
ws.onmessage = (e) => {
  const x = JSON.parse(e.data);
  if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); return; }
  if (x.method === 'Network.requestWillBeSent') {
    const q = x.params.request;
    if (q.url.includes('/gateway/') && !q.url.includes('/gateway/static/')) inflight.set(x.params.requestId, { m: q.method, u: decodeURIComponent(q.url).replace('https://study.cqie.edu.cn', ''), body: q.postData || '', t: new Date().toTimeString().slice(0, 8) });
  } else if (x.method === 'Network.responseReceived') {
    const r = inflight.get(x.params.requestId); if (r) r.status = x.params.response.status;
  } else if (x.method === 'Network.loadingFinished' || x.method === 'Network.loadingFailed') {
    const r = inflight.get(x.params.requestId); if (r) { inflight.delete(x.params.requestId); rows.push(r); }
  }
};
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval 异常'); return r.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mark = () => rows.length;
const dump = (label, from) => {
  const lines = [`\n===== ${label} =====`];
  for (const r of rows.slice(from)) lines.push(`${r.t} ${r.status || 'FAIL'} ${r.m} ${r.u}${r.body ? '\n   body=' + r.body : ''}`);
  if (lines.length === 1) lines.push('（这一路上没有任何 gateway 调用）');
  fs.appendFileSync(OUT, lines.join(String.fromCharCode(10)) + String.fromCharCode(10));
  console.log(lines.join(String.fromCharCode(10)).slice(0, 2600));
};

await send('Page.enable'); await send('Network.enable'); await send('Runtime.enable');
const vid = () => evl(`(()=>{const v=document.querySelector('video');return v?JSON.stringify({vid:(location.href.match(/videoId=(\\w+)/)||[])[1]||'',t:Math.round(v.currentTime),d:Math.round(v.duration),paused:v.paused}):'{}'})()`);
const vv = async () => JSON.parse((await vid()) || '{}');

fs.appendFileSync(OUT, String.fromCharCode(10) + `# ===== 采集开始 ${new Date().toISOString()}` + String.fromCharCode(10));
let m0 = mark();
await send('Page.navigate', { url: URLA });
await sleep(16000);
dump('① 进入视频页（站点自己发了什么）', m0);

m0 = mark();
let s = await vv();
console.log(`当前 t=${s.t}/${s.d} paused=${s.paused}`);
if (s.paused) {
  const box = JSON.parse(await evl(`(()=>{const v=document.querySelector('video');if(!v)return'{}';const r=v.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)})})()`));
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: type === 'mousePressed' ? 'left' : 'none', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  await sleep(3000);
  s = await vv();
  console.log(`合成点击播放键之后 t=${s.t}/${s.d} paused=${s.paused}`);
}
await sleep(WATCH);
s = await vv();
console.log(`观察 ${WATCH / 1000} 秒后 t=${s.t}/${s.d}`);
dump('② 播放过程中（有没有周期上报）', m0);

m0 = mark();
const b = JSON.parse(await evl(`(()=>{const want=('视频：' + ${JSON.stringify(TARGET)}).replace(/\\s+/g,'');const els=[...document.querySelectorAll('div.name')].filter(e=>(e.textContent||'').replace(/\\s+/g,'').startsWith(want));if(!els.length)return JSON.stringify({ok:false,why:'目录里没有该条目',n:document.querySelectorAll('div.name').length});const e=els[0];e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return JSON.stringify({ok:r.width>20&&r.height>5,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),txt:(e.textContent||'').trim().slice(0,40)})})()`));
console.log('目录条目:', JSON.stringify(b));
let switched = false;
if (b.ok) {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: type === 'mousePressed' ? 'left' : 'none', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  for (let i = 0; i < 8 && !switched; i++) { await sleep(2000); switched = (await vv()).vid !== s.vid; }
}
console.log(switched ? '★ 可见窗口里合成点击【能】切视频（headless 下不能 → 差异定位在可见性）' : '✗ 可见窗口里也切不动 → 不是 headless 的问题，是选择器/事件目标');
await sleep(3000);
dump('③ 点目录切走的那一刻（关键：离开上报）', m0);
ws.close(); process.exit(0);
