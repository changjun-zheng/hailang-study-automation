// 修 clickCatalog：把目标条目滚进视口，再打真实鼠标事件；验能不能切、切的时候站点写了什么
//   node .cdp/fix-click.mjs <当前视频页URL> <要点开的目录条目名>
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const URLA = process.argv[2];
const TARGET = process.argv[3] || '使用两种方式实现路由参数传递-1';
const OUT = path.join(ROOT, '.cdp', 'plan-chain.txt');

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map(); const inflight = new Map(); const rows = [];
ws.onmessage = (e) => {
  const x = JSON.parse(e.data);
  if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); return; }
  if (x.method === 'Network.requestWillBeSent') {
    const q = x.params.request;
    if (q.url.includes('/gateway/') && !q.url.includes('/gateway/static/') && !/practiceNotePaged|courseCatalog\/tree|getVideoCloudUrl/.test(q.url)) inflight.set(x.params.requestId, { m: q.method, u: decodeURIComponent(q.url).replace('https://study.cqie.edu.cn', ''), body: q.postData || '', t: new Date().toTimeString().slice(0, 8) });
  } else if (x.method === 'Network.responseReceived') { const r = inflight.get(x.params.requestId); if (r) r.status = x.params.response.status; }
  else if (x.method === 'Network.loadingFinished' || x.method === 'Network.loadingFailed') { const r = inflight.get(x.params.requestId); if (r) { inflight.delete(x.params.requestId); rows.push(r); } }
};
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || '').slice(0, 200); return r.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dump = async (label, from) => {
  const lines = [`\n===== ${label} ${new Date().toTimeString().slice(0, 8)} =====`];
  for (const r of rows.slice(from)) lines.push(`${r.t} ${r.status || 'FAIL'} ${r.m} ${r.u}${r.body ? '\n   ' + r.body.slice(0, 900) : ''}`);
  if (lines.length === 1) lines.push('（无 gateway 调用）');
  fs.appendFileSync(OUT, lines.join(String.fromCharCode(10)) + String.fromCharCode(10));
  console.log(lines.join(String.fromCharCode(10)).slice(0, 3000));
};
const state = async () => JSON.parse((await evl(`(()=>{const v=document.querySelector('video');const vj=(location.href.match(/videoId=(\\w+)/)||[])[1]||'';return JSON.stringify({vid:vj.slice(0,10),urlVid:(location.href.match(/videoId=(\\w+)/)||[])[1]?.slice(0,10),t:v?+v.currentTime.toFixed(1):null,d:v?Math.round(v.duration):null,paused:v?v.paused:null})})()`)) || '{}');

await send('Page.enable'); await send('Network.enable'); await send('Runtime.enable');
let m0 = rows.length;
await send('Page.navigate', { url: URLA });
await sleep(15000);
await evl(`(()=>{const v=document.querySelector('video');if(v){v.muted=true;v.play().catch(()=>{})}})()`);
await sleep(12000);
let s = await state();
console.log('当前:', JSON.stringify(s));
rows.length = 0; m0 = 0;

// 核心：把条目滚进视口（找最近的可滚动祖先，手动改 scrollTop）
const sc = await evl(`(()=>{
  const want=('视频：' + ${JSON.stringify(TARGET)}).replace(/\\s+/g,'');
  const e=[...document.querySelectorAll('div.name')].find(x=>(x.textContent||'').replace(/\\s+/g,'').startsWith(want));
  if(!e)return JSON.stringify({ok:false,why:'找不到条目'});
  let p=e.parentElement,best=null;
  while(p&&p!==document.body){const cs=getComputedStyle(p);if(/auto|scroll/.test(cs.overflowY)&&p.scrollHeight>p.clientHeight+4){best=p;break}p=p.parentElement}
  const before=e.getBoundingClientRect();
  if(best){const br=best.getBoundingClientRect();best.scrollTop+= (before.top+before.height/2)-(br.top+br.height/2);}
  else{window.scrollBy(0,before.top-innerHeight/2);}
  const r=e.getBoundingClientRect();
  const cx=Math.round(r.x+r.width/2),cy=Math.round(r.y+r.height/2);
  const top=document.elementFromPoint(cx,cy);
  return JSON.stringify({ok:r.top>=0&&r.bottom<=innerHeight,cont:best?String(best.className).slice(0,30):'window',y:Math.round(r.y),vh:innerHeight,cx,cy,hit:top?top.tagName+'.'+String(top.className).slice(0,26):'null',isSelfOrChild:top===e||e.contains(top),txt:(e.textContent||'').trim().slice(0,40)})
})()`);
console.log('滚动之后:', sc);
const b = JSON.parse(sc);
if (b.ok && b.isSelfOrChild) {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: b.cx, y: b.cy, button: type === 'mousePressed' ? 'left' : 'none', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  let switched = false;
  for (let i = 0; i < 8 && !switched; i++) { await sleep(1500); const q = await state(); switched = q.vid !== s.vid; }
  console.log(switched ? '★ 滚进视口后真实点击【能】切视频' : '✗ 仍然切不动');
} else if (b.ok) {
  console.log('条目已在视口内，但命中测试显示被别的东西盖住: hit=' + b.hit);
}
await sleep(4000);
await dump('切走这一刻站点写了什么', m0);
ws.close(); process.exit(0);
