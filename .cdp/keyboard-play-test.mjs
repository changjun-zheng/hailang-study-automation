// 视频已经通过真实键盘输入播起来了 —— 现在抓包：走站点自己的播放/暂停路径会不会触发位置上报
//   node .cdp/keyboard-play-test.mjs [观察秒数]
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const SECS = Number(process.argv[2] || 180);
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
const OUT = path.join(ROOT, '.cdp', 'keyboard-play.txt');
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
  } else if (x.method === 'Network.loadingFinished') {
    const r = meta.get(x.params.requestId); if (!r) return; meta.delete(x.params.requestId);
    if (/StudyVideoPlan|Monitor|updateEndTime/i.test(r.u)) {
      send('Network.getResponseBody', { requestId: x.params.requestId }).then((b) => { r.resp = String(b.body || '').slice(0, 300); }).catch(() => {}).finally(() => hits.push(r));
    }
  }
};
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || '').slice(0, 160); return r.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const space = async () => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: ' ', code: 'Space', text: ' ', windowsVirtualKeyCode: 32 }); };
const st = async () => JSON.parse((await evl(`(()=>{const v=document.querySelector('video');return JSON.stringify({t:v?+v.currentTime.toFixed(1):null,d:v?Math.round(v.duration):null,p:v?v.paused:null})})()`)) || '{}');

await send('Page.enable'); await send('Network.enable'); await send('Runtime.enable');
const vid = (await evl(`(location.href.match(/videoId=(\w+)/)||[])[1]||''`)) || '';
const { windowId } = await send('Browser.getWindowForTarget', { targetId: page.id });
const keepNormal = async () => { const b = await send('Browser.getWindowBounds', { windowId }); if (b.bounds.windowState !== 'normal') await send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } }); };
console.log('目标 videoId =', String(vid).slice(0, 12), ' 当前:', JSON.stringify(await st()));
if ((await st()).p) { await evl(`(()=>{document.querySelector('video')?.focus()})()`); await space(); await sleep(2000); }
console.log('键盘起播后:', JSON.stringify(await st()));

console.log(`\n观察 ${SECS} 秒（期间用空格做两次真实暂停/继续）…`);
for (let i = 1; i <= SECS / 30; i++) {
  await sleep(30000); await keepNormal();
  console.log(`  +${i * 30}s ${JSON.stringify(await st())}  命中上报 ${hits.length} 条`);
  if (i === 2 || i === 4) { await evl(`(()=>{document.querySelector('video')?.focus()})()`); await space(); await sleep(2500); console.log(`    空格暂停 → ${JSON.stringify(await st())}  命中 ${hits.length}`); await space(); await sleep(2000); }
}
const rec = await evl(`(async()=>{const t=localStorage.getItem('token2');const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const j=await fetch('/gateway/system/orgStudent/studyVideo?studentCourseId=${SC}&videoId=${vid}&studentId='+me.id+'&majorId=${MID}&version=BK_RJGC_2024',{headers:{Authorization:t}}).then(r=>r.json()).catch(e=>({err:String(e)}));
  return JSON.stringify(j.data||j)})()`);
fs.writeFileSync(OUT, hits.map((h) => `${h.t} ${h.m} ${h.u}${h.body ? '\n   REQ=' + h.body.slice(0, 500) : ''}${h.resp ? '\n   RESP=' + h.resp : ''}`).join(String.fromCharCode(10)) + String.fromCharCode(10) + '记录=' + rec);
console.log(`\n命中上报 ${hits.length} 条：`);
for (const h of hits) console.log(`  ${h.t} ${h.m} ${h.u.slice(0, 110)}${h.body ? '  REQ=' + h.body.slice(0, 300) : ''}`);
console.log(`\n服务端对该视频的现在记录：${String(rec).slice(0, 400)}`);
console.log(hits.length ? '\n★ 走站点自己的播放/暂停路径触发了上报 —— 机制找到' : '\n✗ 真实键盘路径播放+暂停仍然零上报');
ws.close(); process.exit(0);
