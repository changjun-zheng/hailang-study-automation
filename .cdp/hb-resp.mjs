// 面板自己起播之后：视频在播、updateStudyVideoPlan 发了 22 次，但服务端 haveTime +0。
// 说明"发了"不等于"收了"。这一轮直接抓心跳的**请求体与响应体**，看服务端到底回什么；
// 再用一次可信点击做对照，看响应什么时候开始变绿。
//   node .cdp/hb-resp.mjs
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9225';
const fs = await import('node:fs');
const toSec = (t) => String(t || '0:0:0').split(':').reduce((a, p) => a * 60 + (parseInt(p, 10) || 0), 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, seq = 0; const pend = new Map();
const REQ = new Map();       // requestId -> {url, method, postData}
const LOG = [];              // 抓到的心跳样本
async function connect() {
  const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('/MyCourse/Study'));
  if (!tabs.length) throw new Error('没有学习页');
  ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = async (e) => {
    const x = JSON.parse(e.data);
    if (x.method === 'Network.requestWillBeSent') {
      const u = String(x.params.request.url || '');
      if (/updateStudyVideoPlan|studyRecordVideoMonitor|startStudyVideo|saveStudyVideo/.test(u)) REQ.set(x.params.requestId, { url: u, method: x.params.request.method, postData: x.params.request.postData || '' });
    }
    if (x.method === 'Network.responseReceived') {
      const r = REQ.get(x.params.requestId);
      if (r) { r.status = x.params.response.status; r.mimeType = x.params.response.mimeType; }
    }
    if (x.method === 'Network.loadingFinished') {
      const r = REQ.get(x.params.requestId);
      if (r) {
        try {
          const b = await send('Network.getResponseBody', { requestId: x.params.requestId });
          r.body = String(b.body || '').slice(0, 260);
        } catch (err) { r.body = '(取不到响应体：' + err.message + ')'; }
        LOG.push(r); REQ.delete(x.params.requestId);
      }
    }
    if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); }
  };
  await send('Network.enable'); await send('Page.enable');
  return tabs[0];
}
const send = (m, p = {}) => new Promise((res, rej) => {
  const id = ++seq; pend.set(id, { res, rej });
  try { ws.send(JSON.stringify({ id, method: m, params: p })); } catch (e) { pend.delete(id); rej(e); }
});
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 160); return r.result?.value; };
const J = async (e) => JSON.parse(await evl(e));
const have = () => J(`(async()=>{const t=localStorage.getItem('token2'),me=JSON.parse(localStorage.getItem('userInfo2')||'{}'),q=new URLSearchParams(location.search);
  const d=await fetch('/gateway/system/orgStudent/myCourseDetails?studentId='+(me.studyNumber||me.id)+'&id='+q.get('id')+'&majorId='+me.majorId+'&studentCourseId='+q.get('studentCourseId')+'&version='+(q.get('version')||'BK_RJGC_2024'),{headers:{Authorization:t}}).then(r=>r.json()).catch(()=>({}));
  return JSON.stringify({have:(d.data&&d.data.haveTime)||'0:0:0'})})()`);

const tab = await connect();
// 窗口回屏内并保持前台：可信输入要 native visible，两段测量必须在同一个环境下
const ver0 = await (await fetch(BASE + '/json/version')).json();
const bws = new WebSocket(ver0.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
const bp = new Map();
bws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && bp.has(x.id)) { const f = bp.get(x.id); bp.delete(x.id); f(x.result); } };
let bid = 0;
const bask = (method, params) => new Promise((r) => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
const win = await bask('Browser.getWindowForTarget', { targetId: tab.id });
await send('Page.navigate', { url: tab.url });
await sleep(14000);
await bask('Browser.setWindowBounds', { windowId: win.windowId, bounds: { left: 90, top: 90, width: 1180, height: 780, windowState: 'normal' } });
await send('Page.bringToFront');
await sleep(3000);
await evl(`(()=>{window.__kgBuilt=1;window.__kgPanel=null;const p=document.getElementById('kg-panel');if(p)p.remove();return 1})()`);
await evl(fs.readFileSync('hailang-panel.user.js', 'utf8') + '\n;"ok"');
await sleep(2500);

const dump = (tag) => {
  console.log(`  【${tag}】抓到 ${LOG.length} 条上报类请求：`);
  LOG.slice(-3).forEach((r) => console.log(`    ${r.method} ${r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 56)} → HTTP ${r.status}\n      发 ${String(r.postData).slice(0, 190)}\n      回 ${r.body.slice(0, 130)}`));
  LOG.length = 0;
};

console.log('\n[1] 面板合成手势起播（不给任何可信输入）');
const h0 = await have();
await evl(`(()=>{document.getElementById('kg-play').click();return 1})()`);
await sleep(60000);
const h1 = await have();
dump('合成手势之后 60 秒');
console.log(`  haveTime ${h0.have} → ${h1.have}（+${toSec(h1.have) - toSec(h0.have)}s）`);

console.log('\n[2] 重新加载后只给一次可信空格（runner 一直在用的那条路），再等 60 秒');
await send('Page.navigate', { url: tab.url });
await sleep(14000);
await send('Page.bringToFront');
await sleep(2000);
for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, text: ' ' });
await sleep(60000);
const h2 = await have();
dump('可信空格之后 60 秒');
console.log(`  haveTime ${h1.have} → ${h2.have}（+${toSec(h2.have) - toSec(h1.have)}s）`);
console.log(`\n对照：合成段 +${toSec(h1.have) - toSec(h0.have)}s vs 可信段 +${toSec(h2.have) - toSec(h1.have)}s（各 60 秒）`);
await bask('Browser.setWindowBounds', { windowId: win.windowId, bounds: { left: -32000, top: -32000, width: 1280, height: 800, windowState: 'normal' } });
bws.close();
ws.close(); process.exit(0);
