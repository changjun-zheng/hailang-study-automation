// 全量抓取（不过滤）+ 响应体，走一遍站点自己的流程，看服务端对这条视频的记录说了什么
//   node .cdp/full-capture.mjs <进入的视频URL> [观察秒数] [离开后进入的第二个URL]
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const U1 = process.argv[2];
const SECS = Number(process.argv[3] || 180);
const U2 = process.argv[4] || 'https://study.cqie.edu.cn/stu/home';
if (!U1) { console.error('用法: node .cdp/full-capture.mjs <视频URL> [秒] [第二个URL]'); process.exit(1); }
const OUT = path.join(ROOT, '.cdp', 'full-capture.txt');

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map(); const meta = new Map(); const recs = [];
ws.onmessage = (e) => {
  const x = JSON.parse(e.data);
  if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); return; }
  if (x.method === 'Network.requestWillBeSent') {
    const q = x.params.request; const u = decodeURIComponent(q.url);
    if (u.includes('/gateway/')) meta.set(x.params.requestId, { m: q.method, u: u.replace('https://study.cqie.edu.cn', ''), body: q.postData || '', t: new Date().toTimeString().slice(0, 8) });
  } else if (x.method === 'Network.responseReceived') {
    const r = meta.get(x.params.requestId); if (r) r.status = x.params.response.status;
  } else if (x.method === 'Network.loadingFinished') {
    const r = meta.get(x.params.requestId);
    if (!r) return;
    meta.delete(x.params.requestId);
    send('Network.getResponseBody', { requestId: x.params.requestId }).then((b) => { r.resp = String(b.base64Encoded ? Buffer.from(b.body, 'base64').toString('utf8') : b.body || ''); }).catch(() => { r.resp = '(取不到)'; }).finally(() => recs.push(r));
  }
};
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || '').slice(0, 160); return r.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.enable'); await send('Network.enable'); await send('Runtime.enable');
const phase = (s) => { fs.appendFileSync(OUT, String.fromCharCode(10) + `##### ${s} ${new Date().toTimeString().slice(0, 8)}` + String.fromCharCode(10)); console.log(String.fromCharCode(10) + '### ' + s); };

// 守卫：窗口一旦被最小化，Chrome 会直接推迟媒体加载（readyState=0 且 error=null），整轮实验就废了
const assertVisible = async () => {
  const { windowId } = await send('Browser.getWindowForTarget', { targetId: page.id });
  const cur = await send('Browser.getWindowBounds', { windowId });
  if (cur.bounds.windowState !== 'normal') await send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
  const hid = await evl(`Object.getOwnPropertyDescriptor(Document.prototype,'hidden').get.call(document)`);
  return `${cur.bounds.windowState}→normal hidden=${hid}`;
};
console.log('开跑前窗口:', await assertVisible());

phase('A 进入视频页');
await send('Page.navigate', { url: U1 });
await sleep(16000);
// 守卫：必须先证明媒体真的加载出来（duration>0）并且时间在往前走，否则整轮实验无效
const dur = async () => JSON.parse((await evl(`(()=>{const v=document.querySelector('video');return JSON.stringify(v?{t:+v.currentTime.toFixed(1),d:v.duration==null?null:+v.duration,p:v.paused}:{noVideo:true})})()`)) || '{}');
let q = await dur();
for (let i = 0; i < 4 && !(q.d > 0); i++) {
  console.log(`  媒体没加载（d=${q.d}），第 ${i + 1} 次重载重试`);
  await assertVisible();
  await send('Page.reload', { ignoreCache: true });
  await sleep(18000);
  await evl(`(()=>{const v=document.querySelector('video');if(v){v.muted=true;v.play().catch(()=>{})}})()`);
  await sleep(6000);
  q = await dur();
}
if (!(q.d > 0)) { console.log('★ 媒体始终加载不出来，这轮实验作废，不要据此下任何结论'); console.log('  getVideoCloudUrl 的响应：'); for (const r of recs.filter((x) => /getVideoCloudUrl/.test(x.u))) console.log('   ' + r.u.slice(0, 150) + '\n   RESP=' + String(r.resp || '').replace(/\s+/g, ' ').slice(0, 400)); ws.close(); process.exit(2); }
console.log('媒体已就绪:', JSON.stringify(q));
await evl(`(()=>{const v=document.querySelector('video');if(v){v.muted=true;v.play().catch(()=>{})}})()`);
for (let i = 1; i <= SECS / 45; i++) {
  await sleep(45000);
  console.log('  窗口守卫:', await assertVisible());
  const s = await dur();
  console.log(`  +${i * 45}s t=${s.t} d=${s.d} paused=${s.p}`);
  if (!(s.t > 0)) { console.log('★ 时间没推进，这轮作废'); }
  await evl(`(()=>{const v=document.querySelector('video');if(v&&v.paused)v.play().catch(()=>{})})()`);
}
phase('B 播完之后，导航去第二个地址（让站点自己关掉上一条记录）');
await send('Page.navigate', { url: U2 });
await sleep(14000);
await sleep(3000);

const lines = [];
for (const r of recs) lines.push(`${r.t} ${r.status || ''} ${r.m} ${r.u.slice(0, 130)}${r.body ? String.fromCharCode(10) + '   REQ=' + r.body.slice(0, 500) : ''}${String.fromCharCode(10)}   RESP=${(r.resp || '').replace(/\\s+/g, ' ').slice(0, 600)}`);
fs.appendFileSync(OUT, lines.join(String.fromCharCode(10)) + String.fromCharCode(10));
console.log(String.fromCharCode(10) + `共 ${recs.length} 条 gateway 调用（全文已存 .cdp/full-capture.txt）`);
const key = recs.filter((r) => /studyVideo|Monitor|StudyVideoPlan|progress|myCourseDetails/i.test(r.u));
console.log('其中与记账相关的 ' + key.length + ' 条：');
for (const r of key) console.log(`${r.t} ${r.status} ${r.m} ${r.u.slice(0, 120)}\n   RESP=${(r.resp || '').replace(/\\s+/g, ' ').slice(0, 500)}`);
ws.close(); process.exit(0);
