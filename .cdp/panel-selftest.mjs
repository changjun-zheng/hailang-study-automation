// 把面板注进 9225 的学习页，然后用**可信鼠标事件**点它的「记账自检」按钮，
// 看「用户点面板 → 同帧点站点播放控件」这条链能不能发出 updateStudyVideoPlan 心跳。
// 这一步决定油猴方案成不成立：CDP 的 Input.dispatchMouseEvent 是真可信输入，
// 等价于真人点一下，所以结论可以直接外推到同学自己用浏览器的场景。
//   node .cdp/panel-selftest.mjs [页面URL]
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9225';
const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'hailang-panel.user.js'), 'utf8');

const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('study.cqie.edu.cn'));
if (!tabs.length) { console.error('9225 上没有 study 标签页'); process.exit(1); }
const page = tabs[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
// 计数走 CDP 的 Network 域，不包页面的 fetch：站点用 axios（浏览器里是 XHR），
// 只包 window.fetch 会把真实存在的请求量成 0 —— 上一版"零心跳"就是这么来的假阴性。
let seq = 0; const pend = new Map();
const NET = { plans: 0, monitor: 0, seen: [] };
ws.onmessage = (e) => { const x = JSON.parse(e.data);
  if (x.method === 'Network.requestWillBeSent') {
    const u = (x.params.request && x.params.request.url) || '';
    if (u.includes('updateStudyVideoPlan')) NET.plans++;
    if (u.includes('studyRecordVideoMonitor')) NET.monitor++;
    if (/Plan|Monitor/i.test(u)) NET.seen.push(u.replace(/^.*\/gateway\//, 'gateway/').slice(0, 58));
  }
  if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200); return r.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 窗口最小化的话渲染器会被推迟，先还原（一次性，不是轮询抢焦点）
const ver = await (await fetch(BASE + '/json/version')).json();
const bws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
const bpend = new Map();
bws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && bpend.has(x.id)) { const p = bpend.get(x.id); bpend.delete(x.id); p(x.result); } };
let bid = 0;
const bask = (method, params) => new Promise((r) => { const i = ++bid; bpend.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
const w = await bask('Browser.getWindowForTarget', { targetId: page.id });
if (w.bounds?.windowState === 'minimized') {
  await bask('Browser.setWindowBounds', { windowId: w.windowId, bounds: { windowState: 'normal' } });
  console.log('窗口原本最小化，已还原（最小化时渲染器被推迟，测什么都不准）');
  await sleep(1500);
}

await send('Page.enable');
console.log('当前页:', String(await evl('location.href.slice(0,90)')));
let has = await evl('!!document.querySelector("video")');
if (!has) {
  console.log('这一页没有视频，导航到一个视频学习页…');
  await send('Page.navigate', { url: page.url.replace(/\/stu\/home.*/, '/stu/pages/MyCourse/Study') });
  await sleep(9000);
  has = await evl('!!document.querySelector("video")');
  console.log('导航后有视频:', has, '| 页面:', String(await evl('location.href.slice(0,90)')));
}
if (!has) { console.error('还是找不到 <video>，换一个具体的学习页 URL 再跑：node .cdp/panel-selftest.mjs'); process.exit(1); }

// 注入面板
await evl(SRC);
const built = await evl('!!document.getElementById("kg-panel") && !!window.__kgPanel');
console.log('面板已注入:', built);
if (!built) process.exit(1);

const before = JSON.parse(await evl('JSON.stringify({plans:window.__kgPanel.plans,mon:window.__kgPanel.monitor,paused:document.querySelector("video").paused,src:(document.querySelector("video").currentSrc||"").slice(-24)})'));
console.log('点之前:', JSON.stringify(before));

// 先说清楚面板里那条选择器到底命中了什么 —— 上一版"零心跳"就是因为没起播，
// 而没起播可能只是我点错了元素，不能拿来判油猴方案死刑。
const hit = await evl(`(()=>{const b=document.querySelector('.dplayer-play-icon, .dplayer-icon-play, [class*=play-btn], .control-play, .playBtn')||document.querySelector('.dplayer');
  return b? b.tagName+'.'+String(b.className).slice(0,60) : '没找到播放控件'})()`);
console.log('面板自检会点的元素:', hit);
const vids = await evl('document.querySelectorAll("video").length');
console.log(`页面上 <video> 数量: ${vids}`);

const clickAt = async (sel) => {
  const r = JSON.parse(await evl(`JSON.stringify((()=>{const b=document.querySelector(${JSON.stringify(sel)});if(!b)return null;const x=b.getBoundingClientRect();return {x:x.left+x.width/2,y:x.top+x.height/2,w:Math.round(x.width),h:Math.round(x.height)}})())`));
  if (!r) { console.log(`  ${sel} 找不到元素`); return null; }
  await send('Network.enable');
  NET.plans = 0; NET.monitor = 0; NET.seen = [];
  if (r.w === 0 || r.h === 0) { console.log(`  ${sel} 尺寸为 0（多半是播放后按钮变成了暂停态或被隐藏），跳过`); return null; }
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 0 });
  console.log(`  可信点击 ${sel} @(${r.x.toFixed(0)},${r.y.toFixed(0)}) 尺寸 ${r.w}x${r.h}`);
  let last = null;
  // 心跳本身就是 15 秒一次的节奏，采样窗口必须明显长过它，否则"没看到"不等于"没有"
  for (let i = 1; i <= 13; i++) {
    await sleep(5000);
    const st = JSON.parse(await evl('JSON.stringify({paused:document.querySelector("video").paused,t:(document.querySelector("video").currentTime||0).toFixed(1)})'));
    last = { p: NET.plans, mon: NET.monitor, paused: st.paused, t: st.t };
    if (i % 3 === 0 || i === 13) console.log(`    +${i * 5}s 心跳 ${last.p} 次、监控会话 ${last.mon} 次、paused=${last.paused}、进度 ${last.t}s`);
  }
  return last;
};

console.log('\n阶段 A：点面板的「记账自检」（= 用户点面板后，脚本在同一次手势里点站点播放键）');
await clickAt('#kg-selftest');

console.log('\n阶段 B：绕开面板，先把页面重加载回"未播放"的干净状态，再直接可信点击站点播放按钮');
await send('Page.navigate', { url: page.url });
await sleep(10000);
const b = await clickAt('.d-play-btn');

console.log(`\n阶段 B 期间出现过的记账类请求（去重）：\n  ${[...new Set(NET.seen)].slice(0, 8).join('\n  ') || '（一条都没有）'}`);
if (b) {
  console.log(b.p > 0
    ? '\n✓ 真人点击站点播放键能出心跳 —— 组件状态机认这个手势。阶段 A 若为 0，说明"脚本代点"不算真人手势，面板要改成让用户自己点第一下'
    : (b.paused ? '\n? 阶段 B 仍没起播：这个页面不健康或按钮被隐藏，换一条干净的学习页重测再下结论'
      : '\n? 阶段 B 播了但 Network 里也没有心跳：说明记账不靠这个请求，得先搞清 runner 那条链路到底靠什么在记账'));
}
bws.close(); ws.close(); process.exit(0);
