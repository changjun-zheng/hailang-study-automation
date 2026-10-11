// 决定性实验：1 倍速完整播完 + 主动导航离开（触发 updateEndTime 关记录）→ 回读监控记录。
// 为什么必须两个条件一起：
//   昨天 22:30 的 1 倍速实验播到片尾就退出脚本了，从没「离开」→ 记录没关；
//   今天 15:06 的 2 倍速实验「离开」了，但 384 秒的视频只用了 3.2 分钟墙钟 → 疑似被时长判定拒掉。
// 先导航到 about:blank 再导航目标，避免「同一个 URL 重复导航」被 SPA 当成同文档跳转而不重新挂载播放器
// （上一次就是栽在这里：等了 40 秒 duration 恒为 0）。
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const fs = await import('node:fs');
const path = await import('node:path');
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEEP = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id;
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
const V = { unitId: '6814946beba252b0ae35bf229d454ae7', videoId: '6a00eafa7e7ef6fbc28a52f2cba98108', name: '使用生命周期函数-2' };
const OTHER = '3159e08af4683e6e8736a9015ebcae9e';
const OUT = path.join(ROOT, '.cdp', 'one-x-close.txt');
const wlog = console.log;
console.log = (...a) => {
  fs.appendFileSync(OUT, a.join(' ') + '\n');
  wlog(...a);
};

const pages = await (await fetch(BASE + '/json/list')).json();
const full = pages.find((t) => t.id === KEEP && t.type === 'page');
if (!full) {
  console.log('找不到标签页');
  process.exit(1);
}
const ws = new WebSocket(full.webSocketDebuggerUrl);
const pend = new Map();
let seq = 0;
await new Promise((r) => (ws.onopen = r));
const monitor = [];
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
    if (/studyVideo\?|Monitor/i.test(u)) monitor.push(`${Math.round((Date.now() - t0) / 1000)}s ${x.params.request.method} ${decodeURIComponent(u).replace('https://study.cqie.edu.cn', '').slice(0, 120)}`);
  }
};
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pend.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evl = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
let t0 = Date.now();

const api = (u) => `fetch(${JSON.stringify(u)}, {headers:{Authorization: localStorage.getItem('token2')}}).then(r=>r.json())`;
const study = () =>
  evl(
    `${api(`/gateway/system/orgStudent/studyVideo?studentCourseId=${SC}&videoId=${V.videoId}&studentId=YOUR_STUDENT_ID&majorId=${MID}&version=BK_RJGC_2024`)}.then(j=>{const d=j.data||{};return JSON.stringify({studyTime:d.studyTime,startPos:d.startPos,stopPos:d.stopPos,maxCurrentPos:d.maxCurrentPos})})`
  );
const dur = () => evl(`(()=>{const v=document.querySelector('video');return v?JSON.stringify({t:+v.currentTime.toFixed(1),d:+(v.duration||0).toFixed(1),rate:v.playbackRate,paused:v.paused}):'NOVIDEO'})()`);

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
const url = (vid) => `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=${CID}&studentCourseId=${SC}&version=BK_RJGC_2024&courseUnitId=${V.unitId}&videoId=${vid}&majorId=${MID}`;

console.log(`\n===== ${new Date().toTimeString().slice(0, 8)}  ${V.name} 384s @ 1 倍速 + 播完导航离开 =====`);
console.log('开始前 studyVideo =', await study());
console.log('① 先离开到 about:blank，再进目标（强制重新挂载播放器）');
await send('Page.navigate', { url: 'about:blank' });
await sleep(2000);
t0 = Date.now();
await send('Page.navigate', { url: url(V.videoId) });
let d = 0;
for (let i = 0; i < 60; i++) {
  await sleep(1000);
  const s = await dur();
  if (s && s !== 'NOVIDEO') {
    const o = JSON.parse(s);
    d = o.d;
    if (d > 0) break;
  }
}
console.log(`播放器挂载 ${d > 0 ? '成功' : '失败'} duration=${d}；这段时间的监控类调用：\n  ${monitor.join('\n  ') || '（无）'}`);
if (!(d > 0)) {
  console.log('播放器没挂载，本次不作判定');
  process.exit(1);
}
await evl(`(()=>{const v=document.querySelector('video');v.muted=true;v.playbackRate=1;return v.play().then(()=>1).catch(()=>0)})()`);
console.log('② 1 倍速起播');
let last = -1;
for (let i = 0; i < 40; i++) {
  await sleep(20000);
  const o = JSON.parse(await dur());
  if (o.rate !== 1) {
    await evl(`(()=>{const v=document.querySelector('video');v.playbackRate=1;return 1})()`);
    console.log(`  播放器把倍速改回 ${o.rate}，已钉回 1`);
  }
  console.log(`  墙钟 ${Math.round((Date.now() - t0) / 1000)}s  t=${o.t}/${o.d}${o.paused ? ' PAUSED' : ''}`);
  if (o.d - o.t < 2 || (last > 60 && o.t < last - 10)) break;
  last = o.t;
}
console.log('③ 片尾已到。此时 studyVideo =', await study());
const m2 = monitor.length;
console.log('④ 导航去别的视频（触发 updateEndTime 关记录）');
await send('Page.navigate', { url: url(OTHER) });
await sleep(16000);
console.log('   离开时新增监控调用：\n  ' + (monitor.slice(m2).join('\n  ') || '（无）'));
console.log('⑤ 离开后 studyVideo =', await study());
await sleep(30000);
console.log('   再等 30 秒 studyVideo =', await study());
const p = JSON.parse(await evl(`${api(`/gateway/system/orgStudent/myCourseDetails?studentId=YOUR_STUDENT_ID&id=${CID}&majorId=${MID}&studentCourseId=${SC}&version=BK_RJGC_2024`)}.then(j=>JSON.stringify({haveTime:j.data.haveTime}))`));
console.log('   课程已记时长 =', p.haveTime);
ws.close();
process.exit(0);
