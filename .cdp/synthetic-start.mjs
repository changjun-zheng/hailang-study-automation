// 上一轮（start-route.mjs）把结论打穿了：合成事件打在 document.elementFromPoint 命中的元素上，
// 心跳出现了 1 次；而打在 .d-play-btn 自己身上是 0 次。也就是说"面板必须人点一下"这个结论，
// 很可能一直是我点错元素，不是 Chrome 的可信性拦的。
// 这一轮做定量：起播之后**连续采样 60 秒**，看服务端 haveTime 涨不涨得起来
// —— 心跳 1 次不算数，涨满 60 秒才算"面板能全自动起播"。
// 同时每 5 秒回显 native hidden：如果它是被"失焦自停"打断的，采样里看得清清楚楚。
//   node .cdp/synthetic-start.mjs
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9225';
const ONLY = process.argv.slice(2).map((s) => s.toUpperCase());
const toSec = (t) => String(t || '0:0:0').split(':').reduce((a, p) => a * 60 + (parseInt(p, 10) || 0), 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 0; const pend = new Map(); const NET = { plans: 0 };
let ws;
async function connect() {
  const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('/MyCourse/Study'));
  if (!tabs.length) throw new Error('没有学习页');
  ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (e) => {
    const x = JSON.parse(e.data);
    if (x.method === 'Network.requestWillBeSent' && String(x.params?.request?.url || '').includes('updateStudyVideoPlan')) NET.plans++;
    if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); }
  };
  await send('Page.enable'); await send('Network.enable');
  return tabs[0];
}
const send = (m, p = {}) => new Promise((res, rej) => {
  const id = ++seq; pend.set(id, { res, rej });
  try { ws.send(JSON.stringify({ id, method: m, params: p })); } catch (e) { pend.delete(id); rej(e); }
});
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 140); return r.result?.value; };
const J = async (e) => JSON.parse(await evl(e));
const SNAP = `JSON.stringify((()=>{const d=Object.getOwnPropertyDescriptor(Document.prototype,'hidden');
  const v=document.querySelector('video');
  return{hidden:d.get.call(document),cur:v?+v.currentTime.toFixed(1):-1,paused:v?v.paused:null,dur:v?+(v.duration||0).toFixed(0):-1}})())`;
const have = () => J(`(async()=>{const t=localStorage.getItem('token2'),me=JSON.parse(localStorage.getItem('userInfo2')||'{}'),q=new URLSearchParams(location.search);
  const d=await fetch('/gateway/system/orgStudent/myCourseDetails?studentId='+(me.studyNumber||me.id)+'&id='+q.get('id')+'&majorId='+me.majorId+'&studentCourseId='+q.get('studentCourseId')+'&version='+(q.get('version')||'BK_RJGC_2024'),{headers:{Authorization:t}}).then(r=>r.json()).catch(()=>({}));
  return JSON.stringify({have:(d.data&&d.data.haveTime)||'0:0:0'})})()`);
const HITS = `JSON.stringify((()=>{const o={};
  const put=(k,el)=>{if(!el)return;o[k]=(()=>{const x=el.getBoundingClientRect();return{x:x.left+x.width/2,y:x.top+x.height/2,w:Math.round(x.width),h:Math.round(x.height)}})()};
  put('btn',document.querySelector('.d-play-btn, [class*=play-btn]'));
  put('vid',document.querySelector('video'));
  for(const k in o){const p=o[k];if(!p.w)continue;const e=document.elementFromPoint(p.x,p.y);
    o[k].hit=e?e.tagName+'.'+String(e.className).slice(0,30):'null';}
  return o})())`;
const fireSynth = (k) => J(`JSON.stringify((()=>{const o=JSON.parse(${HITS});const p=o[${JSON.stringify(k)}];if(!p||!p.w)return 'no';
  const e=document.elementFromPoint(p.x,p.y);if(!e)return 'nohit';
  for(const t of ['pointerover','pointerdown','mousedown','pointerup','mouseup','click']){
    const E=t.startsWith('pointer')?PointerEvent:MouseEvent;
    e.dispatchEvent(new E(t,{bubbles:true,cancelable:true,view:window,clientX:p.x,clientY:p.y}));}
  return e.tagName+'.'+String(e.className).slice(0,30)})())`);

const win0 = await (await fetch(BASE + '/json/version')).json();
const bws = new WebSocket(win0.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
const bp = new Map();
bws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && bp.has(x.id)) { const f = bp.get(x.id); bp.delete(x.id); f(x.result); } };
let bid = 0;
const bask = (method, params) => new Promise((r) => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
const t0 = await connect();
const win = await bask('Browser.getWindowForTarget', { targetId: t0.id });
const raise = async () => { await bask('Browser.setWindowBounds', { windowId: win.windowId, bounds: { left: 90, top: 90, width: 1180, height: 780, windowState: 'normal' } }); await send('Page.bringToFront'); await sleep(2500); };

const runs = {
  P1: { name: 'P1 合成事件打在 video 中心的命中元素', run: () => fireSynth('vid') },
  P2: { name: 'P2 合成事件打在 .d-play-btn 中心的命中元素', run: () => fireSynth('btn') },
  P3: { name: 'P3 可信点击 video 中心（正对照）', run: async () => {
    const o = await J(HITS); const p = o.vid; if (!p || !p.w) return 'no';
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 0 });
    return p.hit; } },
};
console.log('命中测试：' + JSON.stringify(await J(HITS)));
const out = [];
for (const k of Object.keys(runs)) {
  if (ONLY.length && !ONLY.includes(k)) continue;
  const R = runs[k];
  const tab = await connect();
  await send('Page.navigate', { url: tab.url });
  await sleep(14000);
  await raise();
  NET.plans = 0;
  const b = await have();
  const s0 = await J(SNAP);
  const hit = await R.run();
  const marks = [];
  for (let i = 1; i <= 12; i++) {
    await sleep(5000);
    const s = await J(SNAP);
    marks.push({ t: i * 5, cur: s.cur, paused: s.paused, hidden: s.hidden });
  }
  const a = await have();
  const grew = toSec(a.have) - toSec(b.have);
  const adv = Math.max(0, ...marks.map((m) => m.cur)) - s0.cur;
  out.push({ k, name: R.name, hit: String(hit), adv: Math.round(adv), beats: NET.plans, grew });
  console.log(`  ${R.name}：命中=${hit} | 60s 内进度推进 ${Math.round(adv)}s | 心跳 ${NET.plans} 次 | haveTime ${b.have}→${a.have}（+${grew}s）`);
  console.log(`    采样 paused/hidden：` + marks.map((m) => `${m.t}s:${m.paused ? '停' : '播'}${m.hidden ? '/隐' : ''}`).join(' '));
}
const ctrl = out.filter((r) => r.k === 'P3')[0];
console.log('\n判读：');
if (!ctrl || !(ctrl.beats > 0)) console.log('  ✗ 正对照（可信点击 video 中心）没量到心跳 —— 环境或测量坏了，下面不作结论');
else {
  console.log(`  ✓ 正对照：可信点击 → 推进 ${ctrl.adv}s、心跳 ${ctrl.beats}、haveTime +${ctrl.grew}s`);
  for (const r of out.filter((x) => x.k !== 'P3')) {
    const ok = r.beats > 0 && r.grew > 0;
    console.log(`  ${r.name}：推进 ${r.adv}s、心跳 ${r.beats}、haveTime +${r.grew}s → ${ok ? '合成事件就能起播并记账，面板可以去掉"亲手点一下"' : (r.adv > 5 ? '画面动了但不记账' : '没起播')}`);
  }
}
await bask('Browser.setWindowBounds', { windowId: win.windowId, bounds: { left: -32000, top: -32000, width: 1280, height: 800, windowState: 'normal' } });
console.log('窗口已挪回屏幕外');
bws.close(); process.exit(0);
