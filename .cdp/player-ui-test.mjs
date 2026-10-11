// 测「走播放器自己的控件路径才上报位置」：只用真实鼠标点控件，绝不碰 v.play()
//   node .cdp/player-ui-test.mjs <study页URL> [观察秒数]
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const U = process.argv[2];
const SECS = Number(process.argv[3] || 90);
const OUT = path.join(ROOT, '.cdp', 'player-ui.txt');
if (!U) { console.error('缺 URL'); process.exit(1); }

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map(); const meta = new Map(); let hits = [];
ws.onmessage = (e) => {
  const x = JSON.parse(e.data);
  if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); return; }
  if (x.method === 'Network.requestWillBeSent') {
    const q = x.params.request; const u = decodeURIComponent(q.url);
    if (u.includes('/gateway/') && !u.includes('/gateway/static/')) meta.set(x.params.requestId, { m: q.method, u: u.replace('https://study.cqie.edu.cn', ''), body: q.postData || '', t: new Date().toTimeString().slice(0, 8) });
  } else if (x.method === 'Network.responseReceived') { const r = meta.get(x.params.requestId); if (r) r.status = r.status; }
  else if (x.method === 'Network.loadingFinished') {
    const r = meta.get(x.params.requestId); if (!r) return; meta.delete(x.params.requestId);
    if (/StudyVideoPlan|Monitor|updateEndTime/i.test(r.u)) hits.push(r);
  }
};
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || '').slice(0, 200); return r.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const guard = async () => { const { windowId } = await send('Browser.getWindowForTarget', { targetId: page.id }); const b = await send('Browser.getWindowBounds', { windowId }); if (b.bounds.windowState !== 'normal') await send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } }); };
const st = async () => JSON.parse((await evl(`(()=>{const v=document.querySelector('video');if(!v)return '{}';return JSON.stringify({t:+v.currentTime.toFixed(1),d:(v.duration||0)?+v.duration.toFixed(1):null,p:v.paused})})()`)) || '{}');
const clickXY = async (x, y) => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mousePressed' ? 'left' : 'none', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 }); };

await send('Page.enable'); await send('Network.enable'); await send('Runtime.enable');
await guard();
await send('Page.navigate', { url: U });
await sleep(20000);
await guard();
console.log('初始:', JSON.stringify(await st()));

// 列出播放器上所有可点的控件
const ctr = JSON.parse((await evl(`(()=>{
  const out=[...document.querySelectorAll('[class*="d-player"],[class*="player"]')]
   .filter(e=>{const r=e.getBoundingClientRect();return r.width>8&&r.height>8&&r.top>=0&&r.bottom<=innerHeight})
   .map(e=>{const r=e.getBoundingClientRect();return {cls:String(e.className).slice(0,46),x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),w:Math.round(r.width),h:Math.round(r.height)}});
  return JSON.stringify(out.slice(0,26))
})()`)) || '[]');
console.log(`\\n播放器控件 ${ctr.length} 个：`);
for (const c of ctr) console.log(`  ${c.cls} ${c.w}x${c.h} @${c.x},${c.y}`);
fs.writeFileSync(OUT, '控件清单: ' + ctr.map((c) => c.cls).join(' | ') + String.fromCharCode(10));

// 只点控件起播（不调 v.play()）
hits = [];
for (const c of ctr.filter((x) => /play|btn|icon|mask|video/i.test(x.cls))) {
  await clickXY(c.x, c.y);
  await sleep(2500);
  const s = await st();
  if (!s.p) { console.log(`  ★ 点「${c.cls}」后开始播放 (t=${s.t})`); break; }
}
let s = await st();
console.log('起播结果:', JSON.stringify(s));

// 播一段，然后点控件暂停，看上报
for (let i = 0; i < SECS / 15; i++) { await sleep(15000); await guard(); console.log(`  +${(i + 1) * 15}s`, JSON.stringify(await st()), '命中上报', hits.length); }
hits = [];
for (const c of ctr.filter((x) => /pause|play|btn|icon/i.test(x.cls))) { await clickXY(c.x, c.y); await sleep(1500); if ((await st()).p) { console.log(`  点「${c.cls}」暂停成功`); break; } }
await sleep(6000);
console.log(`\\n暂停后命中上报 ${hits.length} 条：`);
for (const h of hits) console.log(`  ${h.t} ${h.m} ${h.u.slice(0, 110)}${h.body ? '  REQ=' + h.body.slice(0, 400) : ''}`);
fs.appendFileSync(OUT, '暂停后上报 ' + hits.length + ' 条: ' + hits.map((h) => h.u).join(String.fromCharCode(10)));
console.log(hits.length ? '\\n★ 走控件路径触发了上报 —— 找到机制' : '\\n✗ 走控件路径也没有上报');
ws.close(); process.exit(0);
