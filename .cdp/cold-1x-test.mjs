// 决定性对照：一条「从没播过」的视频 + 1 倍速 + 窗口在屏幕外，同时把媒体字节请求的时间线抓下来。
// 要判的假设：服务端是靠「媒体文件请求的时间跨度」推算已看时长的，
//            所以 2 倍速（跨度只有一半）和「命中浏览器缓存、根本没发请求的重播」都不记账。
// 这个脚本不注入油猴脚本：屏幕外的页面 Chrome 认为是 visible，站点自己不会暂停，少一个变量。
//   node .cdp/cold-1x-test.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOCK = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id;
const COURSE = process.env.COURSE || '前端框架';
const RATEWANT = Number(process.env.RATE || 1);
const state = JSON.parse(fs.readFileSync(path.join(ROOT, '.runner-state.json'), 'utf-8'));
// 重定向到文件时 node 的 stdout 是块缓冲的，看不到进度；这里让每行都同步落盘
const OUT = path.join(ROOT, '.cdp', 'cold-1x.txt');
const wlog = console.log;
console.log = (...a) => {
  fs.appendFileSync(OUT, a.join(' ') + '\n');
  wlog(...a);
};

const ver = await (await fetch(BASE + '/json/version')).json();
const bw = new WebSocket(ver.webSocketDebuggerUrl);
const bp = new Map();
let bid = 0;
await new Promise((r) => (bw.onopen = r));
bw.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && bp.has(x.id)) {
    const p = bp.get(x.id);
    bp.delete(x.id);
    p(x.result);
  }
};
const bask = (method, params) => new Promise((r) => { const i = ++bid; bp.set(i, r); bw.send(JSON.stringify({ id: i, method, params })); });

const pages = await (await fetch(BASE + '/json/list')).json();
const t = pages.find((x) => x.id === LOCK && x.type === 'page');
if (!t) {
  console.error('找不到 runner 标签页');
  process.exit(1);
}
const ws = new WebSocket(t.webSocketDebuggerUrl);
const pend = new Map();
let seq = 0;
await new Promise((r) => (ws.onopen = r));
const media = [];
let t0 = 0;
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && pend.has(x.id)) {
    const p = pend.get(x.id);
    pend.delete(x.id);
    x.error ? p.rej(new Error(x.error.message)) : p.res(x.result);
    return;
  }
  if (x.method === 'Network.requestWillBeSent') {
    const u = x.params.request.url;
    if (/\/res\/video\/|\.mp4|\.m3u8|[?&]format=mp4/i.test(u)) {
      media.push({ at: Math.round((Date.now() - t0) / 1000), range: x.params.request.headers['Range'] || x.params.request.headers['range'] || '-', url: u.slice(-70) });
    }
  }
};
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pend.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evl = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'eval 异常').slice(0, 200));
  return r.result?.value;
};
const get = (url) => `fetch(${JSON.stringify(url)}, {headers:{Authorization: localStorage.getItem('token2')}}).then(r=>r.json())`;

// 窗口保持在屏幕外；--focus 时额外给它 OS 焦点（屏幕外的窗口拿到焦点也不会出现在桌面上）
const { windowId } = await bask('Browser.getWindowForTarget', { targetId: LOCK });
await bask('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
await sleep(400);
await bask('Browser.setWindowBounds', { windowId, bounds: { left: -30000, top: -30000, width: 1280, height: 800 } });
const FOCUS = process.env.FOCUS || '';

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');

const prof = JSON.parse(await evl(`JSON.stringify((()=>{const u=JSON.parse(localStorage.getItem('userInfo2')||'{}');return {id:u.id||'',majorId:u.majorId||''}})())`));
const course = JSON.parse(
  await evl(
    `fetch('/gateway/frequent/orgStudent/pagedMyCourse',{method:'POST',headers:{'Content-Type':'application/json',Authorization:localStorage.getItem('token2')},body:JSON.stringify({filters:{courseNature:null,name:'',schoolYear:'',studentId:${JSON.stringify(prof.id)},term:'',courseFlag:0},pageIndex:1,pageSize:50})}).then(r=>r.json()).then(j=>JSON.stringify((j.data.records||[]).find(c=>(c.name||'').includes(${JSON.stringify(COURSE)}))))`
  )
);
const sid = course.studentCourseId || course.id;
const pdUrl = `/gateway/system/orgStudent/progressDetails?studentId=${prof.id}&id=${course.id}&majorId=${prof.majorId}&studentCourseId=${sid}&version=${course.version}`;
// 直接按「服务端 haveTime 为空」挑一条最短的视频来测 —— 本地记没记过不算数，服务端认不认才算
const allVids = JSON.parse(
  await evl(
    `${get(pdUrl)}.then(j=>{const out=[];(function w(ns){for(const n of ns||[]){for(const x of (n.courseCatalogVideoVos||[])){out.push({unitId:n.id,videoId:x.id,name:x.name,seconds:x.timeLength,have:x.haveTime})}w(n.children)}})(j.data);return JSON.stringify(out.filter(v=>v.have===null&&v.seconds>0))})`
  )
);
allVids.sort((x, y) => x.seconds - y.seconds);
const TESTED = `.cdp/cold-tested-${COURSE}.json`;
const tested = fs.existsSync(path.join(ROOT, TESTED)) ? JSON.parse(fs.readFileSync(path.join(ROOT, TESTED), 'utf-8')) : [];
const pool = allVids.filter((v) => !tested.includes(v.videoId));
const target = pool[Number(process.env.NTH || 0)];
console.log(`服务端未记账的视频共 ${allVids.length} 条（已排除做过实验的 ${tested.length} 条）`);
if (!target) {
  console.error('这门课已经没有"未记账"的视频了，本实验无法做');
  process.exit(1);
}
fs.writeFileSync(path.join(ROOT, TESTED), JSON.stringify([...tested, target.videoId], null, 1));
console.log(`目标 = ${target.name} ${target.seconds}s  videoId=${target.videoId}`);

const readHave = () =>
  evl(
    `${get(pdUrl)}.then(j=>{const hit=[];(function w(ns){for(const n of ns||[]){for(const x of (n.courseCatalogVideoVos||[])){if(x.id===${JSON.stringify(target.videoId)})hit.push([x.timeLength,x.haveTime])}w(n.children)}})(j.data);return JSON.stringify(hit)})`
  );
console.log('播之前服务端记录:', await readHave());

const url = `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=${course.id}&studentCourseId=${sid}&version=${course.version}&courseUnitId=${target.unitId}&videoId=${target.videoId}&majorId=${prof.majorId}`;
t0 = Date.now();
await send('Page.navigate', { url });
let st = null;
for (let i = 0; i < 40; i++) {
  await sleep(1000);
  st = await evl(`(()=>{const v=document.querySelector('video');if(!v)return null;let rv='?';try{rv=Object.getOwnPropertyDescriptor(Document.prototype,'visibilityState').get.call(document)}catch(e){}return JSON.stringify({d:+(v.duration||0).toFixed(1),t:+v.currentTime.toFixed(1),rate:v.playbackRate,rv})})()`);
  if (st && JSON.parse(st).d > 0) break;
}
if (FOCUS === 'emulate') {
  // 只让页面「以为」自己有焦点，不抬窗口、不碰他的键盘鼠标
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  console.log('已开焦点仿真：hasFocus = ' + (await evl(`document.hasFocus()`)));
} else if (FOCUS) {
  await bask('Target.activateTarget', { targetId: LOCK });
  console.log('已给窗口 OS 焦点（它仍在屏幕外）：hasFocus = ' + (await evl(`document.hasFocus()`)));
}
console.log('页面就绪:', st, ` 媒体请求数=${media.length}`);
const D = JSON.parse(st).d;

// 钉成 1 倍速并起播
await evl(`(()=>{const v=document.querySelector('video');v.muted=true;v.playbackRate=${RATEWANT};return v.play().then(()=>'ok').catch(e=>'rej:'+e.name)})()`);
console.log('已按 ' + RATEWANT + ' 倍速起播，等待完整播完（约 ' + Math.round(D / 60) + ' 分钟）');

let last = -1, done = false;
for (let i = 0; i < 130; i++) {
  await sleep(15000);
  const s = JSON.parse(
    await evl(`(()=>{const v=document.querySelector('video');return JSON.stringify({t:+v.currentTime.toFixed(1),d:+(v.duration||0).toFixed(1),rate:v.playbackRate,paused:v.paused,ended:v.ended})})()`)
  );
  console.log(`  +${Math.round((Date.now() - t0) / 1000)}s t=${s.t}/${s.d} rate=${s.rate} 媒体请求=${media.length}${s.paused ? ' PAUSED' : ''}`);
  // 播放器会按它自己存的偏好把倍速恢复成 2（这次实测到了），所以每轮都要钉回 1，否则实验条件不成立
  if (FOCUS === 'os') await bask('Target.activateTarget', { targetId: LOCK });
  if (s.rate !== RATEWANT) {
    await evl(`(() => { const v = document.querySelector('video'); v.playbackRate = RATEWANT; return 1; })()`);
    console.log(`  （播放器把倍速改回了 ${s.rate}，已钉回 ${RATEWANT}）`);
  }
  if (s.ended || s.d - s.t < 2 || (last > 60 && s.t < last - 10)) {
    done = true;
    break;
  }
  last = s.t;
}
await sleep(15000);
console.log('\n播完之后服务端记录:', await readHave());
console.log(`\n媒体请求时间线（秒 → Range 头），共 ${media.length} 条：`);
for (const r of media.slice(0, 25)) console.log(`  +${String(r.at).padStart(4)}s  ${r.range}`);
if (media.length > 25) console.log(`  …还有 ${media.length - 25} 条`);
console.log(done ? '\n本次确实播到了片尾' : '\n⚠️ 没观察到片尾，本次不作判定');
ws.close();
bw.close();
process.exit(0);
