// 一次问清三件事：① 用 DPlayer 自己的播放键能不能起播 ② 暂停时站点发不发位置上报 ③ 目录条目用 el.click() 能不能切
//   node .cdp/capture-plan2.mjs <视频页URL> <目录条目名> [播放观察秒]
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const URLA = process.argv[2];
const TARGET = process.argv[3] || '使用两种方式实现路由参数传递-1';
const WATCH = Number(process.argv[4] || 20) * 1000;
const OUT = path.join(ROOT, '.cdp', 'plan-chain.txt');
if (!URLA) { console.error('缺参数'); process.exit(1); }

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
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || '').slice(0, 160); return r.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dump = async (label, from) => {
  const lines = [`\n===== ${label} =====`];
  for (const r of rows.slice(from)) lines.push(`${r.t} ${r.status || 'FAIL'} ${r.m} ${r.u}${r.body ? '\n   ' + r.body.slice(0, 700) : ''}`);
  if (lines.length === 1) lines.push('（无 gateway 调用）');
  fs.appendFileSync(OUT, lines.join(String.fromCharCode(10)) + String.fromCharCode(10));
  console.log(lines.join(String.fromCharCode(10)).slice(0, 2200));
};
const state = async () => JSON.parse((await evl(`(()=>{const v=document.querySelector('video');const vj=(location.href.match(/videoId=(\\w+)/)||[])[1]||'';return JSON.stringify(v?{vid:vj.slice(0,10),t:+v.currentTime.toFixed(1),d:Math.round(v.duration),paused:v.paused}:{vid:vj})})()`)) || '{}');

await send('Page.enable'); await send('Network.enable'); await send('Runtime.enable');
let m0 = rows.length;
await send('Page.navigate', { url: URLA });
await sleep(15000);
await dump('① 进入页面', m0);

// ② 用 DPlayer 自己的播放按钮（真实手势，绕开 autoplay 限制）
m0 = rows.length;
const btn = JSON.parse((await evl(`(()=>{const s=['.d-player-play-icon','.dplayer-play-icon','[class*=play-icon]','[class*=bezel]','[class*=mask]','.d-player-video video'];for(const k of s){const e=document.querySelector(k);if(e){const r=e.getBoundingClientRect();if(r.width>4&&r.height>4)return JSON.stringify({sel:k,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)})}}return JSON.stringify({classes:[...document.querySelectorAll('[class*=d-player]')].slice(0,14).map(e=>String(e.className).slice(0,30)).join(' | ')})})()`)) || '{}');
console.log('找到的播放按钮:', JSON.stringify(btn));
if (btn.x !== undefined) {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: btn.x, y: btn.y, button: type === 'mousePressed' ? 'left' : 'none', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  await sleep(4000);
}
let s = await state();
console.log('点播放键之后:', JSON.stringify(s));
if (s.paused) { console.log('还是没播，试 el.click() 兜底 + v.play()'); await evl('document.querySelector(".dplayer-play-icon")?.click()'); await sleep(2500); await evl('document.querySelector("video")?.play().catch(e=>String(e))'); await sleep(3000); s = await state(); console.log('再查:', JSON.stringify(s)); }
await sleep(WATCH);
s = await state();
console.log(`观察 ${WATCH / 1000}s 之后:`, JSON.stringify(s));
await dump('② 播放期间有没有周期上报', m0);

// ③ 暂停 → 看站点发什么
m0 = rows.length;
await evl('document.querySelector("video").pause()');
await sleep(4000);
await dump('③ 暂停这一刻（找 saveStudyVideoPlan）', m0);

// ④ 目录条目改用 el.click()
m0 = rows.length;
const info = await evl(`(()=>{const want=('视频：' + ${JSON.stringify(TARGET)}).replace(/\\s+/g,'');const els=[...document.querySelectorAll('div.name')].filter(e=>(e.textContent||'').replace(/\\s+/g,'').startsWith(want));if(!els.length)return 'NO';const e=els[0];const chain=[];let p=e;for(let i=0;i<5&&p;i++){chain.push(p.tagName+'.'+String(p.className).split(' ').slice(0,2).join('.'));p=p.parentElement}return JSON.stringify({txt:(e.textContent||'').trim().slice(0,44),chain})})()`);
console.log('目录条目与祖先链:', info);
await evl(`(()=>{const want=('视频：' + ${JSON.stringify(TARGET)}).replace(/\\s+/g,'');const e=[...document.querySelectorAll('div.name')].find(x=>(x.textContent||'').replace(/\\s+/g,'').startsWith(want));if(e)e.click()})()`);
await sleep(6000);
let s2 = await state();
console.log('el.click() 之后:', JSON.stringify(s2), s2.vid !== s.vid ? '★ 切成功了' : '✗ 还是没切');
if (s2.vid === s.vid) {
  await evl(`(()=>{const want=('视频：' + ${JSON.stringify(TARGET)}).replace(/\\s+/g,'');const e=[...document.querySelectorAll('div.name')].find(x=>(x.textContent||'').replace(/\\s+/g,'').startsWith(want));if(!e)return;const r=e.getBoundingClientRect();const cx=Math.round(r.x+r.width/2),cy=Math.round(r.y+r.height/2);const top=document.elementFromPoint(cx,cy);window.__hit=top?top.tagName+'.'+String(top.className).slice(0,40)+'|是否目标后代='+(e.contains(top)||!!top.closest?.('div.name')):'null'})()`);
  console.log('坐标命中测试:', await evl('String(window.__hit)'), JSON.stringify(await evl(`(()=>{const want=('视频：'+${JSON.stringify(TARGET)}).replace(/\\s+/g,'');const e=[...document.querySelectorAll('div.name')].find(x=>(x.textContent||'').replace(/\\s+/g,'').startsWith(want));const r=e.getBoundingClientRect();return JSON.stringify({y:Math.round(r.y),vh:innerHeight,scrollTop:document.querySelector('.catalogue,.el-scrollbar__wrap,[class*=scroll]')?.scrollTop||0})})()`)));
}
await sleep(4000);
await dump('④ el.click() 切走这一刻', m0);
ws.close(); process.exit(0);
