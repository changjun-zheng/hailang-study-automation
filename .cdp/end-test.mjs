// 验「站点是不是只在视频真正走到片尾时才上报」：不注入任何脚本，把进度设到片尾前 N 秒，让它自然播完
//   node .cdp/end-test.mjs <study页URL> [片尾前几秒]
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const U = process.argv[2];
const BEFORE = Number(process.argv[3] || 8);
const OUT = path.join(ROOT, '.cdp', 'end-test.txt');
if (!U) { console.error('用法: node .cdp/end-test.mjs <studyURL> [片尾前秒]'); process.exit(1); }

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map(); const meta = new Map(); const hits = [];
ws.onmessage = (e) => {
  const x = JSON.parse(e.data);
  if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); return; }
  if (x.method === 'Network.requestWillBeSent') {
    const q = x.params.request; const u = decodeURIComponent(q.url);
    if (u.includes('/gateway/') && !u.includes('/gateway/static/')) meta.set(x.params.requestId, { m: q.method, u: u.replace('https://study.cqie.edu.cn', ''), body: q.postData || '', t: new Date().toTimeString().slice(0, 8) });
  } else if (x.method === 'Network.responseReceived') { const r = meta.get(x.params.requestId); if (r) r.status = x.params.response.status; }
  else if (x.method === 'Network.loadingFinished') {
    const r = meta.get(x.params.requestId); if (!r) return; meta.delete(x.params.requestId);
    if (/StudyVideoPlan|Monitor|studyVideo\?/i.test(r.u)) {
      send('Network.getResponseBody', { requestId: x.params.requestId }).then((b) => { r.resp = String(b.base64Encoded ? Buffer.from(b.body, 'base64').toString('utf8') : b.body || ''); }).catch(() => { r.resp = ''; }).finally(() => hits.push(r));
    }
  }
};
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || '').slice(0, 160); return r.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const st = async () => JSON.parse((await evl(`(()=>{const v=document.querySelector('video');if(!v)return JSON.stringify({noVideo:true});return JSON.stringify({t:+v.currentTime.toFixed(1),d:(v.duration==null||isNaN(v.duration))?null:+v.duration.toFixed(1),p:v.paused,e:v.ended})})()`)) || '{}');
const guard = async () => { const { windowId } = await send('Browser.getWindowForTarget', { targetId: page.id }); const b = await send('Browser.getWindowBounds', { windowId }); if (b.bounds.windowState !== 'normal') await send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } }); return b.bounds.windowState; };

await send('Page.enable'); await send('Network.enable'); await send('Runtime.enable');
console.log('窗口:', await guard());
await send('Page.navigate', { url: U });
await sleep(18000);
let s = await st();
for (let i = 0; i < 3 && !(s.d > 0); i++) { await guard(); await send('Page.reload', { ignoreCache: true }); await sleep(18000); s = await st(); }
console.log('媒体:', JSON.stringify(s));
if (!(s.d > 0)) { console.log('★ 媒体加载不出来，作废'); process.exit(2); }
hits.length = 0;
// 关键：不注入任何脚本，只把倍速拉高，让它自己走到真正的片尾（seek 会被站点打回 0，所以只能真播完）
const RATE = Number(process.env.RATE || 8);
await evl(`(()=>{const v=document.querySelector('video');v.muted=true;try{v.playbackRate=${RATE}}catch(e){}v.play().catch(()=>{})})()`);
console.log(`以 ${RATE} 倍速从 0 自然播完（不 seek、不注入），观察它到片尾时发什么…`);
for (let i = 0; i < 40; i++) {
  await sleep(5000);
  const q = await st();
  console.log(`  +${(i + 1) * 5}s t=${q.t} d=${q.d} rate=${await evl('document.querySelector("video").playbackRate')} paused=${q.p} ended=${q.e} 命中上报 ${hits.length} 条`);
  if (q.p && q.d && !q.e) await evl(`(()=>{const v=document.querySelector('video');try{v.playbackRate=${RATE}}catch(e){}v.play().catch(()=>{})})()`);
  if (hits.length) break;
}
await sleep(6000);
const lines = [`# end-test ${new Date().toISOString()} 目标=${U.slice(0, 60)}…`];
for (const r of hits) lines.push(`${r.t} ${r.status || ''} ${r.m} ${r.u.slice(0, 120)}${r.body ? String.fromCharCode(10) + '   REQ=' + r.body.slice(0, 600) : ''}${String.fromCharCode(10)}   RESP=${String(r.resp || '').replace(/\\s+/g, ' ').slice(0, 500)}`);
fs.writeFileSync(OUT, lines.join(String.fromCharCode(10)) + String.fromCharCode(10));
console.log(String.fromCharCode(10) + (hits.length ? '★ 片尾触发了上报：' : '✗ 走完片尾仍然零上报'));
for (const l of lines.slice(1)) console.log(l);
ws.close(); process.exit(0);
