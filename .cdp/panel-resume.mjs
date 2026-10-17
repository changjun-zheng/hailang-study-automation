// 「切窗口就停」的成因取证 + 修复验证。同一页上做 A/B 受控对照，不拿两个时刻的观察凑证据。
//   A 阶段（装的是 v0.3.2）：在页面**原生 visible** 的状态下程序化 pause()，看它会不会自己回来。
//      v0.3.2 的接手判据是 reallyHidden()，visible 时应当**不回**——这就是他看到的现象。
//   B 阶段（注入 v0.3.3）：同样条件下再 pause()，应当毫秒级回来，且「自动接手」计数 +1。
//   C 阶段：用可信鼠标点站点的暂停键，代表用户意图，v0.3.3 应当**尊重、不接手**。
//   D 阶段：最小化窗口 20 秒，看被停之后能不能回来、心跳还发不发（这台实例带遮挡豁免参数，
//      结论不能直接搬到用户自己的 Chrome，只用来确认「接手逻辑在 hidden 下也对」）。
//   node .cdp/panel-resume.mjs            默认 9225
//   CDP_BASE=http://127.0.0.1:9224 node .cdp/panel-resume.mjs
import fs from 'node:fs';
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9225';
const SRC = process.env.PANEL_SRC || 'D:/Workspace/Code_Projects/hailang-AutoCourse/hailang-panel.user.js';
const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('/MyCourse/Study'));
if (!tabs.length) { console.error('没有学习页标签，先进到某条视频的学习页再测'); process.exit(1); }
const tab = tabs[0];
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map(); const NET = { plans: 0 };
ws.onmessage = (e) => {
  const x = JSON.parse(e.data);
  if (x.method === 'Network.requestWillBeSent' && String(x.params?.request?.url || '').includes('updateStudyVideoPlan')) NET.plans++;
  if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); }
};
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200); return r.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = async (e) => JSON.parse(await evl(e));
await send('Network.enable'); await send('Page.enable');

// 原生可见性：伪装之后的 document.hidden 不可信，判据必须读原型上的原生 getter
const nat = () => J(`JSON.stringify((()=>{const h=Object.getOwnPropertyDescriptor(Document.prototype,'hidden').get.call(document);
  const v=Object.getOwnPropertyDescriptor(Document.prototype,'visibilityState').get.call(document);
  return{hidden:h,vs:v,focus:document.hasFocus()}})())`);
const stt = () => J(`JSON.stringify((()=>{const v=document.querySelector('video');if(!v)return{noVideo:1};
  return{paused:v.paused,cur:+v.currentTime.toFixed(1),dur:+(v.duration||0).toFixed(1),rate:v.playbackRate,
  ver:(window.__kgPanel||{}).version||null,resumes:(window.__kgPanel&&window.__kgPanel.G)?(window.__kgPanel.G.pauses||0):null}})())`);

let s = await stt();
if (s.noVideo) { console.error('这一页没有 <video>，样本无效'); process.exit(1); }
console.log(`起点：v${s.ver} 原生可见性=${JSON.stringify(await nat())} paused=${s.paused} 进度 ${s.cur}/${s.dur}`);

// 先确保在播：起播要用可信点击，脚本 play() 会让站点自己的状态机不认账
if (s.paused) {
  const r = await J(`JSON.stringify((()=>{const b=document.querySelector('.d-play-btn, [class*=play-btn]');if(!b)return{};
    const x=b.getBoundingClientRect();return{x:x.left+x.width/2,y:x.top+x.height/2,w:Math.round(x.width),h:Math.round(x.height)}})())`);
  if (!r.w) { console.error('播放按钮找不到或尺寸为 0，样本作废'); process.exit(1); }
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(3000);
  s = await stt();
  if (s.paused) { console.error('可信点击后仍未起播（可能不在学习页或登录失效），样本作废'); process.exit(1); }
  console.log(`  可信点击已起播：进度 ${s.cur}/${s.dur}`);
}

const probePause = async (label, expectResume) => {
  const n0 = await nat();
  NET.plans = 0;
  const before = await stt();
  await evl('(()=>{const v=document.querySelector("video");v.pause();return 1})()');
  const marks = [];
  for (const t of [300, 1200, 2600]) { await sleep(t - (marks.length ? marks[marks.length - 1].t : 0)); const x = await stt(); marks.push({ t, paused: x.paused, cur: x.cur, resumes: x.resumes }); }
  const back = marks.some((m) => m.paused === false);
  const hit = back === expectResume;
  console.log(`  ${label}：原生 hidden=${n0.hidden} 接手计数 ${before.resumes}→${marks[marks.length - 1].resumes} 心跳 ${NET.plans} 次 → ` +
    marks.map((m) => `${m.t}ms:${m.paused ? '停' : '播'}`).join(' ') + ` | ${hit ? '符合预期' : '与预期相反'}`);
  if (!back) { await evl('(()=>{const v=document.querySelector("video");v.play().catch(()=>{});return 1})()'); await sleep(1500); }
  return { back, hit };
};

console.log('\n[A] v0.3.2 的行为（预期：visible 时它不接手，所以一直停着）');
const a = await probePause('v0.3.2 程序化 pause', false);

console.log('\n[B] 注入 v0.3.3 后同一条件下再测（预期：当场接手）');
await evl(`(()=>{window.__kgBuilt=1;window.__kgPanel=null;const p=document.getElementById('kg-panel');if(p)p.remove();return 1})()`);
const inj = await evl(fs.readFileSync(SRC, 'utf8') + '\n;"injected"');
console.log(`  注入结果：${inj}`);
await sleep(2500);
let b1 = await stt();
if (b1.ver !== '0.3.3') { console.error(`  注入后版本仍是 ${b1.ver}，样本作废`); process.exit(1); }
if ((await stt()).paused) { await evl('(()=>{document.querySelector("video").play().catch(()=>{});return 1})()'); await sleep(1200); }
const b = await probePause('v0.3.3 程序化 pause', true);

console.log('\n[C] 可信点击站点暂停键 = 用户意图（预期：v0.3.3 不接手，暂停要留得住）');
const pb = await J(`JSON.stringify((()=>{const b=document.querySelector('.d-play-btn, [class*=play-btn]');if(!b)return{};
  const inP=!!(b.closest&&b.closest('video, .dplayer, [class*=player], [class*=play], [class*=control]'));
  const x=b.getBoundingClientRect();return{x:x.left+x.width/2,y:x.top+x.height/2,w:Math.round(x.width),inP,tag:b.tagName+'.'+String(b.className).slice(0,40)}})())`);
if (!pb.w) { console.log('  暂停控件找不到，跳过 C'); } else if (!pb.inP) { console.log(`  ! 控件 ${pb.tag} 不在面板认的播放器范围内 → 这条会被当用户意图漏判，需要放宽选择器`); }
else {
  const r0 = await stt();
  NET.plans = 0;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pb.x, y: pb.y, button: 'left', clickCount: 1, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pb.x, y: pb.y, button: 'left', clickCount: 1, buttons: 0 });
  const ms = [];
  for (const t of [600, 2000, 4000]) { await sleep(t - (ms.length ? ms[ms.length - 1].t : 0)); const x = await stt(); ms.push({ t, paused: x.paused, resumes: x.resumes }); }
  const stayed = ms.every((m) => m.paused === true);
  console.log(`  点了 ${pb.tag}（在播放器内=${pb.inP}）→ ` + ms.map((m) => `${m.t}ms:${m.paused ? '停' : '播'}`).join(' ') +
    ` 接手计数 ${r0.resumes}→${ms[2].resumes} | ${stayed ? '✓ 尊重了用户暂停' : '✗ 把用户的暂停抢回来了'}`);
  await evl('(()=>{const v=document.querySelector("video");if(v.paused)v.play().catch(()=>{});return 1})()');
}

console.log('\n[D] 最小化窗口 20 秒（hidden 路径，这台实例带遮挡豁免参数，只验逻辑不验他的 Chrome）');
const ver = await (await fetch(BASE + '/json/version')).json();
const bws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
const bp = new Map();
bws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && bp.has(x.id)) { const f = bp.get(x.id); bp.delete(x.id); f(x.result); } };
let bid = 0;
const bask = (method, params) => new Promise((r) => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
const w0 = await bask('Browser.getWindowForTarget', { targetId: tab.id });
const before0 = await stt();
NET.plans = 0;
await bask('Browser.setWindowBounds', { windowId: w0.windowId, bounds: { windowState: 'minimized' } });
await sleep(20000);
const n3 = await nat(), s3 = await stt();
console.log(`  最小化 20s 后：原生 hidden=${n3.hidden}/${n3.vs} paused=${s3.paused} 进度 ${before0.cur}→${s3.cur} 接手计数 ${before0.resumes}→${s3.resumes} 这 20s 心跳 ${NET.plans} 次`);
await bask('Browser.setWindowBounds', { windowId: w0.windowId, bounds: { left: -32000, top: -32000, width: 1280, height: 800, windowState: 'normal' } });
await sleep(3000);
const s4 = await stt(), n4 = await nat();
console.log(`  还原（挪到屏幕外，不抢前台）：hidden=${n4.hidden} paused=${s4.paused} 进度 ${s4.cur}/${s4.dur}`);

console.log(`\n判定：A ${a.back ? 'v0.3.2 居然接手了（成因假设不成立）' : 'v0.3.2 没接手，复现了「切窗口就停」'} | B ${b.hit ? 'v0.3.3 当场接手，修复有效' : 'v0.3.3 没接手，修复无效，别推'}`);
bws.close(); ws.close(); process.exit(0);
