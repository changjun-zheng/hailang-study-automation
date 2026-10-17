// 决定面板值不值得做下去的那个问题：用户亲手点一下起播之后，
// 视频播完、站点自动顺播到下一条时，记账会不会自己续上？
//   会 → 用户每个单元点一下就行，面板可用
//   不会 → 每条视频都要点一下，一门课几十次，面板只适合管答题
//
// 手法：先用 CDP 可信鼠标点站点播放键（等价真人点一下），确认心跳与 haveTime 都在涨；
// 再把进度拖到片尾前 25 秒，等它自然播完并顺播，之后**不再给任何输入**，只看 haveTime 还涨不涨。
// 判据取"连续多个采样点都在涨"，不取单次跳变 —— 拖动进度本身可能让服务端一次多算，单次跳变说明不了问题。
//   node .cdp/panel-autoadvance.mjs
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9225';
import path from 'node:path';

const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('study.cqie.edu.cn'));
if (!tabs.length) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
const NET = { plans: 0 };
ws.onmessage = (e) => {
  const x = JSON.parse(e.data);
  if (x.method === 'Network.requestWillBeSent' && String(x.params?.request?.url || '').includes('updateStudyVideoPlan')) NET.plans++;
  if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); }
};
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 160); return r.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toSec = (t) => String(t || '0:0:0').split(':').reduce((a, p) => a * 60 + (parseInt(p, 10) || 0), 0);

// 窗口最小化时渲染器被推迟，测什么都不准（这是探针动作，不是面板行为）
const ver = await (await fetch(BASE + '/json/version')).json();
const bws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
const bp = new Map();
bws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && bp.has(x.id)) { const f = bp.get(x.id); bp.delete(x.id); f(x.result); } };
let bid = 0;
const bask = (method, params) => new Promise((r) => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
const t0page = tabs[0];
const w0 = await bask('Browser.getWindowForTarget', { targetId: t0page.id });
if (w0.bounds?.windowState === 'minimized') { await bask('Browser.setWindowBounds', { windowId: w0.windowId, bounds: { windowState: 'normal' } }); console.log('窗口原本最小化，已还原'); await sleep(1500); }

await send('Network.enable');
await send('Page.enable');

const st = async () => JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const v=document.querySelector('video');
  const cid=new URLSearchParams(location.search).get('id'),sid=new URLSearchParams(location.search).get('studentCourseId'),ver=new URLSearchParams(location.search).get('version')||'BK_RJGC_2024';
  const d=await fetch('/gateway/system/orgStudent/myCourseDetails?studentId='+(me.studyNumber||me.id)+'&id='+cid+'&majorId='+me.majorId+'&studentCourseId='+sid+'&version='+ver,{headers:{Authorization:t}}).then(r=>r.json()).catch(()=>({}));
  return JSON.stringify({have:(d.data&&d.data.haveTime)||'0',cur:v?+v.currentTime.toFixed(1):-1,dur:v?v.duration:-1,paused:v?v.paused:null,src:(v&&(v.currentSrc||'').slice(-14))||'',vid:new URLSearchParams(location.search).get('videoId')||location.href.match(/videoId=([^&]+)/)?.[1]||'',title:(document.querySelector('.video-title,.catalog-active')||{}).textContent||''})
})()`));

// 判据说明：haveTime 是「按视频完成结算」的量，不是按秒累积（实测播完一条 566s 的视频，
// haveTime 从 null 正好变成 566s）。所以中途观察它不动不代表没记账，
// 领先指标是心跳请求本身，落库指标是这条视频的 studyVideoStatus 翻成 2。
await send('Page.navigate', { url: tabs[0].url });
await sleep(12000);
let s = await st();
console.log(`起始：haveTime=${s.have} 进度 ${s.cur}/${s.dur} paused=${s.paused} videoId=${String(s.vid).slice(0, 10)}`);
if (!(s.dur > 120)) { console.log('这条视频太短或没加载出来，换一条再测'); process.exit(1); }

// ① 真人等价点击：可信鼠标点站点播放键
const r = JSON.parse(await evl('JSON.stringify((()=>{const b=document.querySelector(".d-play-btn, [class*=play-btn]");if(!b)return {};const x=b.getBoundingClientRect();return {x:x.left+x.width/2,y:x.top+x.height/2,w:Math.round(x.width)};})())'));
if (!r.w) { console.error('播放按钮找不到或尺寸为 0（说明视频已在播），这轮作废'); process.exit(1); }
NET.plans = 0;
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 0 });
const base0 = (await st()).have;
console.log(`已可信点击站点播放键 @(${r.x.toFixed(0)},${r.y.toFixed(0)})，先确认这条路本身能记账…`);
await sleep(35000);
let a = await st();
const grew1 = toSec(a.have) - toSec(base0);
console.log(`  点击后 35s：进度 ${a.cur}s、心跳 ${NET.plans} 次、haveTime ${a.have}（+${grew1}s）`);
if (grew1 <= 0) { console.log('✗ 连真人点击这条路都没记账，前提不成立，先修这个'); process.exit(1); }

// ② 拖到片尾前 25 秒，之后不再给任何输入
await evl(`(()=>{const v=document.querySelector('video');v.currentTime=Math.max(0,v.duration-25);return v.currentTime})()`);
console.log(`\n已把进度拖到片尾前 25 秒，之后**不再给任何输入**，观察它顺播到下一条之后还涨不涨…`);
const marks = [];
let prev = a;
for (let i = 1; i <= 9; i++) {
  await sleep(20000);
  const n = await st();
  const d = toSec(n.have) - toSec(prev.have);
  marks.push(d);
  const switched = String(n.vid) !== String(prev.vid) || n.src !== prev.src;
  console.log(`  +${i * 20}s 进度 ${n.cur}/${n.dur} paused=${n.paused} videoId ${switched ? '已换→' + String(n.vid).slice(0, 8) : '同一条'} haveTime=${n.have}（这 20s 内 ${d >= 0 ? '+' : ''}${d}s）`);
  prev = n;
  if (i >= 4 && marks.slice(-3).every((x) => x <= 0)) break;
}
const after = marks.slice(1);   // 丢掉顺播前那一段，只看换条之后
const sustained = after.filter((x) => x > 0).length;
console.log(`\n换条之后的采样增量：${after.join(', ')}`);
console.log(sustained >= 2
  ? '✓ 结论：用户点一次起播后，站点顺播到下一条时记账会自己续上 —— 面板按"每单元点一下"设计就够用'
  : '✗ 结论：顺播到下一条就不再记账（每条视频都得用户亲手点一下）—— 播放这层不适合交给纯页面脚本');
bws.close(); ws.close(); process.exit(0);
