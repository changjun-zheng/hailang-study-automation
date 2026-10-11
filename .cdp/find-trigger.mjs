// A 路线：把右侧面板的按钮结构整个 dump 出来，再逐个真实点击，找哪个动作会触发 saveStudyVideoPlan
//   node .cdp/find-trigger.mjs <study页URL>
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const U = process.argv[2];
const OUT = path.join(ROOT, '.cdp', 'find-trigger.txt');
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
  } else if (x.method === 'Network.responseReceived') { const r = meta.get(x.params.requestId); if (r) r.status = x.params.response.status; }
  else if (x.method === 'Network.loadingFinished') {
    const r = meta.get(x.params.requestId); if (!r) return; meta.delete(x.params.requestId);
    if (!/practiceNotePaged|courseCatalog\/tree|getVideoCloudUrl|progressDetails|myCourseDetails/.test(r.u)) {
      send('Network.getResponseBody', { requestId: x.params.requestId }).then((b) => { r.resp = String(b.base64Encoded ? Buffer.from(b.body, 'base64').toString('utf8') : b.body || ''); }).catch(() => { r.resp = ''; }).finally(() => hits.push(r));
    }
  }
};
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || '').slice(0, 160); return r.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const guard = async () => { const { windowId } = await send('Browser.getWindowForTarget', { targetId: page.id }); const b = await send('Browser.getWindowBounds', { windowId }); if (b.bounds.windowState !== 'normal') await send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } }); return b.bounds.windowState; };
const clickXY = async (x, y) => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mousePressed' ? 'left' : 'none', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 }); };

await send('Page.enable'); await send('Network.enable'); await send('Runtime.enable');
console.log('窗口:', await guard());
await send('Page.navigate', { url: U });
await sleep(18000);
await guard();

const dump = JSON.parse((await evl(`(()=>{
  const btns=[...document.querySelectorAll('.myBtn,[class*=myBtn]')].map((e,i)=>{const r=e.getBoundingClientRect();return {i,txt:(e.textContent||'').trim().slice(0,12),dis:e.getAttribute('disabled'),cls:String(e.className),w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}});
  const rows=[...document.querySelectorAll('.item,.name,[class*=step],[class*=catalog] > div')].filter(e=>{const r=e.getBoundingClientRect();return r.height>8&&r.width>40}).slice(0,60).map((e,i)=>{const r=e.getBoundingClientRect();return {i,tag:e.tagName,cls:String(e.className).slice(0,30),txt:(e.textContent||'').replace(/\\s+/g,' ').trim().slice(0,34),y:Math.round(r.y)}});
  return JSON.stringify({btns,rows,url:location.href.slice(0,60)})
})()`)) || '{}');
console.log('URL:', dump.url);
console.log(`\n按钮类元素 ${dump.btns.length} 个：`);
for (const b of dump.btns) console.log(`  [${b.i}] "${b.txt}" disabled=${b.dis} ${b.w}x${b.h} @${b.x},${b.y} cls=${b.cls}`);
console.log(`\n前 30 个行级元素：`);
for (const r of dump.rows.slice(0, 30)) console.log(`  ${r.tag}.${r.cls} "${r.txt}" y=${r.y}`);
fs.writeFileSync(OUT, JSON.stringify(dump, null, 1));

// 逐个点：先点启用中的按钮，再点步骤行
const targets = dump.btns.filter((b) => b.dis !== 'true' && b.w > 6 && b.y > 0 && b.y < 851);
console.log(`\n可点（未 disabled 且在视口内）的按钮 ${targets.length} 个，逐个试：`);
for (const b of targets) {
  hits = [];
  await guard();
  await clickXY(b.x, b.y);
  await sleep(7000);
  console.log(`  点 "${b.txt}" @${b.x},${b.y} → 抓到 ${hits.length} 条非轮询请求`);
  for (const h of hits) console.log(`     ${h.status} ${h.m} ${h.u.slice(0, 110)}${h.body ? '\n       REQ=' + h.body.slice(0, 500) : ''}${h.resp ? '\n       RESP=' + String(h.resp).replace(/\s+/g, ' ').slice(0, 300) : ''}`);
  fs.appendFileSync(OUT, String.fromCharCode(10) + `##### 点 "${b.txt}" @${b.x},${b.y}` + String.fromCharCode(10) + hits.map((h) => `${h.status} ${h.m} ${h.u}${h.body ? '  REQ=' + h.body : ''}  RESP=${String(h.resp).slice(0, 300)}`).join(String.fromCharCode(10)));
  if (hits.some((h) => /StudyVideoPlan/i.test(h.u))) { console.log('  ★★ 命中 saveStudyVideoPlan / updateStudyVideoPlan'); break; }
}
ws.close(); process.exit(0);
