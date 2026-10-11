// 独立新窗口内测量有效倍速。
// 为什么要新窗口：runner 每 2 秒 Target.activateTarget 抢前台，会把被测标签页打成 hidden，
// Chrome 对 hidden 标签页的媒体解码降速 —— 上一轮读数 1.73x 就是这么被污染出来的。
// 这里把 runner 窗口挪到屏幕左半、测量窗口放右半，两边都保持 visible。
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const fs = await import('node:fs');
const path = await import('node:path');
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'hailang-background-play.user.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NOINJECT = !!process.env.NOINJECT;
// NOINJECT + SET=n ：对照实验，不注入脚本、把倍速钉在 n，用同一套采样看 1x 能跑多快
const URL_STUDY =
  'https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=4fafa68754ee9872feb67b4cda5f2c4f&studentCourseId=255b69a5ce54ba7a2c6caa5321b323f7&version=BK_RJGC_2024&courseUnitId=637e13855783d8a848d38a25bded5d2f&videoId=26eb45aadf79b473f4f5f45545c709ec&majorId=9f07cf1e06d0a57957bd6be34efd3930';

let runnerId = null;
try {
  runnerId = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id;
} catch (e) {}

const mk = async (wsUrl) => {
  const ws = new WebSocket(wsUrl);
  const inflight = new Map();
  let seq = 0;
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('ws 失败'));
    ws.onmessage = (m) => {
      const x = JSON.parse(m.data);
      if (x.id && inflight.has(x.id)) {
        const p = inflight.get(x.id);
        inflight.delete(x.id);
        x.error ? p.rej(new Error(x.error.message)) : p.res(x.result);
      }
    };
  });
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++seq;
      inflight.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evl = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
  return { ws, send, evl };
};

const ver = await (await fetch(BASE + '/json/version')).json();
const B = await mk(ver.webSocketDebuggerUrl);

const { targetId } = await B.send('Target.createTarget', { url: 'about:blank', newWindow: true });
let wsUrl = null;
for (let i = 0; i < 25 && !wsUrl; i++) {
  await sleep(400);
  wsUrl = (await (await fetch(BASE + '/json/list')).json()).find((t) => t.id === targetId)?.webSocketDebuggerUrl;
}
if (!wsUrl) {
  console.error('新窗口标签页连不上');
  process.exit(1);
}
const P = await mk(wsUrl);
await B.send('Target.activateTarget', { targetId });
await sleep(1000);

// 左右错开：先摆 runner 窗口、最后摆我的窗口，让我的窗口压在顶层
let runnerWin = null, runnerOrig = null;
try {
  const scr = JSON.parse(await P.evl(`JSON.stringify({l:screen.availLeft,t:screen.availTop,w:screen.availWidth,h:screen.availHeight})`));
  const half = Math.max(640, Math.round(scr.w / 2) - 20);
  if (runnerId) {
    runnerWin = (await B.send('Browser.getWindowForTarget', { targetId: runnerId })).windowId;
    runnerOrig = (await B.send('Browser.getWindowBounds', { windowId: runnerWin })).bounds;
    await B.send('Browser.setWindowBounds', { windowId: runnerWin, bounds: { left: scr.l + 10, top: scr.t + 10, width: half, height: scr.h - 30, windowState: 'normal' } });
  }
  const mine = (await B.send('Browser.getWindowForTarget', { targetId })).windowId;
  await B.send('Browser.setWindowBounds', { windowId: mine, bounds: { left: scr.l + scr.w - half - 10, top: scr.t + 10, width: half, height: scr.h - 30, windowState: 'normal' } });
  await B.send('Target.activateTarget', { targetId });
  await sleep(800);
  console.log(`窗口已错开：可用区 ${scr.w}x${scr.h}，每半 ${half} 宽`);
} catch (e) {
  console.log('窗口未能错开:', e.message);
}
const restoreRunner = async () => {
  if (!runnerWin || !runnerOrig) return;
  try {
    await B.send('Browser.setWindowBounds', { windowId: runnerWin, bounds: runnerOrig });
    console.log('runner 窗口已还原为', runnerOrig.windowState);
  } catch (e) {}
};

await P.send('Page.enable');
await P.send('Runtime.enable');
if (!NOINJECT) await P.send('Page.addScriptToEvaluateOnNewDocument', { source: SRC });
await P.send('Page.navigate', { url: URL_STUDY });

const probe = `(()=>{const v=document.querySelector('video');if(!v)return 'NOVIDEO';let bfr=-1;try{const b=v.buffered;if(b.length)bfr=+(b.end(b.length-1)-v.currentTime).toFixed(1)}catch(e){}return JSON.stringify({vis:document.visibilityState,rv:(()=>{try{return Object.getOwnPropertyDescriptor(Document.prototype,'visibilityState').get.call(document)}catch(e){return '?'}})(),foc:document.hasFocus(),rate:v.playbackRate,muted:v.muted,t:+v.currentTime.toFixed(1),rs:v.readyState,bfr,d:+(v.duration||0).toFixed(1),paused:v.paused,wall:Date.now()})})()`;
const parse = (s) => (s === 'NOVIDEO' ? null : JSON.parse(s));

// 真可见性：脚本会把 document.visibilityState 伪造成 visible，只有原型 getter 说实话。
// 新建窗口常被别的窗口压住或被最小化 -> Chrome 按 hidden 降速媒体，读数全部作废，所以先把它扳正。
const realVis = async () => parse(await P.evl(`(()=>{let rv='?';try{rv=Object.getOwnPropertyDescriptor(Document.prototype,'visibilityState').get.call(document)}catch(e){}return JSON.stringify({rv})})()`))?.rv;
const myWin = async () => (await B.send('Browser.getWindowForTarget', { targetId })).windowId;
async function ensureVisible(label) {
  for (let i = 0; i < 6; i++) {
    const rv = await realVis();
    if (rv === 'visible') {
      if (i) console.log(`[${label}] 第 ${i + 1} 次置前后真可见`);
      return true;
    }
    try {
      const w = await myWin();
      const st = (await B.send('Browser.getWindowBounds', { windowId: w })).bounds.windowState;
      if (st !== 'normal') await B.send('Browser.setWindowBounds', { windowId: w, bounds: { windowState: 'normal' } });
      await P.send('Page.bringToFront');
    } catch (e) {}
    await sleep(900);
  }
  return false;
}

await sleep(2500);
await ensureVisible('载入后');

let o = null;
// 播放器挂载比页面慢得多（要先拉目录再取播放地址），给到 90 秒
for (let i = 0; i < 45; i++) {
  await sleep(2000);
  o = parse(await P.evl(probe));
  if (o && o.d > 0) break;
  if (i % 10 === 9) await ensureVisible('等时长');
}
console.log('就绪:', JSON.stringify(o));
if (o && o.d > 0 && !(await ensureVisible('起播前'))) {
  console.error('窗口无法真可见，读数会被后台降速污染，放弃');
  await B.send('Target.closeTarget', { targetId });
  await restoreRunner();
  process.exit(2);
}
if (!o || !(o.d > 0)) {
  console.error('等不到可测视频，本次不判定');
  await B.send('Target.closeTarget', { targetId });
  await restoreRunner();
  process.exit(1);
}
if (NOINJECT && process.env.SET) console.log('手动设 rate=', await P.evl(`(()=>{const v=document.querySelector('video');v.playbackRate=${Number(process.env.SET)};return v.playbackRate})()`));
// CTRL=n：对照实验。脚本自己有条逃生门——"1.5 秒内他动过手就不再多管"，
// 所以先在 document 上派发一次 pointerdown（脚本只读时间戳，不校验 isTrusted），再把倍速钉到 n，
// 脚本会把他当成手动改过倍速的人而放手，这样就能在同一环境下量 1x 的底数。
if (process.env.CTRL) {
  await P.evl(`document.dispatchEvent(new Event('pointerdown'))`);
  console.log('对照：钉 rate =', await P.evl(`(()=>{const v=document.querySelector('video');v.playbackRate=${Number(process.env.CTRL)};return v.playbackRate})()`));
}
console.log('起播:', await P.evl(`(()=>{const v=document.querySelector('video');if(v){v.muted=true;return v.play().then(()=>'ok').catch(e=>'rej:'+e.name)}return 'NOVIDEO'})()`));
await sleep(3000);

const series = [];
for (let i = 0; i < 16; i++) {
  const s = parse(await P.evl(probe));
  if (s) series.push(s);
  await sleep(2000);
}
const a = series[0], b = series[series.length - 1];
if (!a || !b) {
  console.error(`采样丢失 a=${JSON.stringify(a)} b=${JSON.stringify(b)}`);
  await B.send('Target.closeTarget', { targetId });
  await restoreRunner();
  process.exit(1);
}
const dt = b.t - a.t, dw = (b.wall - a.wall) / 1000;
console.log('逐 2 秒(视频秒/可见V或H/缓冲秒):', series.map((s, i) => `${i ? (s.t - series[i - 1].t).toFixed(1) : s.t}${s.rv === 'visible' ? 'V' : 'H'}${s.bfr}`).join(' '));
console.log(`有效性: 全程真visible=${series.every((s) => s.rv === 'visible')}  有焦点=${series.filter((s) => s.foc).length}/${series.length}  rate=${[...new Set(series.map((s) => s.rate))].join('/')}  最少缓冲=${Math.min(...series.map((s) => s.bfr))}s  暂停过=${series.some((s) => s.paused)}`);
console.log(`实际倍速 = ${dt.toFixed(1)}s 视频 / ${dw.toFixed(1)}s 墙钟 = ${(dt / dw).toFixed(2)}x   （muted=${b.muted}）`);
await B.send('Target.closeTarget', { targetId });
await restoreRunner();
await sleep(400);
B.ws.close();
P.ws.close();
process.exit(0);
