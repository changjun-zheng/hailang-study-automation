// 决定性实验：1 倍速完整播完 → 然后「导航离开」（触发 updateEndTime 关记录）→ 回读 studyVideo。
// 背景：服务端只在「进视频」时开监控记录、「离开」时关闭，播放过程中没有任何进度上报。
//      昨天我的 1 倍速对照播到片尾就退出了脚本，记录一直没关，所以不能算已学 —— 这个脚本把「关记录」补上。
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const fs = await import('node:fs');
const path = await import('node:path');
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEEP = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id;
const RATE = Number(process.env.RATE || 1);
const V = { unitId: '6814946beba252b0ae35bf229d454ae7', videoId: '6a00eafa7e7ef6fbc28a52f2cba98108', name: '使用生命周期函数-2' };
const OTHER = '3159e08af4683e6e8736a9015ebcae9e';
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const OUT = path.join(ROOT, '.cdp', 'close-record.txt');
const wlog = console.log;
console.log = (...a) => {
  fs.appendFileSync(OUT, a.join(' ') + '\n');
  wlog(...a);
};

const full = (await (await fetch(BASE + '/json/list')).json()).find((t) => t.id === KEEP && t.type === 'page');
const ws = new WebSocket(full.webSocketDebuggerUrl);
const pend = new Map();
let seq = 0;
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && pend.has(x.id)) {
    const p = pend.get(x.id);
    pend.delete(x.id);
    x.error ? p.rej(new Error(x.error.message)) : p.res(x.result);
  }
};
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pend.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evl = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
const api = (u) => `fetch(${JSON.stringify(u)}, {headers:{Authorization: localStorage.getItem('token2')}}).then(r=>r.json())`;
const study = () => evl(`${api(`/gateway/system/orgStudent/studyVideo?studentCourseId=${SC}&videoId=${V.videoId}&studentId=YOUR_STUDENT_ID&majorId=9f07cf1e06d0a57957bd6be34efd3930&version=BK_RJGC_2024`)}.then(j=>{const d=j.data||{};return JSON.stringify({studyTime:d.studyTime,startPos:d.startPos,stopPos:d.stopPos,maxCurrentPos:d.maxCurrentPos,studyNumber:d.studyNumber})})`);
const status = () =>
  evl(
    `${api(`/gateway/system/orgStudent/progressDetails?studentId=YOUR_STUDENT_ID&id=e8716aab5bc18a56b115d3303f43555c&majorId=9f07cf1e06d0a57957bd6be34efd3930&studentCourseId=${SC}&version=BK_RJGC_2024`)}.then(j=>{const hit=[];(function w(ns){for(const n of ns||[]){for(const x of (n.courseCatalogVideoVos||[])){if(x.id===${JSON.stringify(V.videoId)})hit.push({haveTime:x.haveTime})}w(n.children)}})(j.data);return JSON.stringify(hit)})`
  );

await send('Page.enable');
await send('Runtime.enable');
const url = (vid) => `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=e8716aab5bc18a56b115d3303f43555c&studentCourseId=${SC}&version=BK_RJGC_2024&courseUnitId=${V.unitId}&videoId=${vid}&majorId=9f07cf1e06d0a57957bd6be34efd3930`;

console.log(`\n===== ${new Date().toString().slice(16, 24)} 目标 ${V.name} (384s) 用 ${RATE} 倍速 =====`);
console.log('开始前 studyVideo =', await study());
await send('Page.navigate', { url: url(V.videoId) });
let d = 0;
for (let i = 0; i < 40; i++) {
  await sleep(1000);
  const s = await evl(`(()=>{const v=document.querySelector('video');return v?JSON.stringify({d:+(v.duration||0).toFixed(1)}):'{}'})()`);
  d = JSON.parse(s).d || 0;
  if (d > 0) break;
}
console.log(`播放器就绪 duration=${d}，起播并钉 ${RATE} 倍速`);
await evl(`(()=>{const v=document.querySelector('video');v.muted=true;v.playbackRate=${RATE};return v.play().then(()=>1).catch(()=>0)})()`);
let last = -1;
for (let i = 0; i < 60; i++) {
  await sleep(15000);
  const s = JSON.parse(await evl(`(()=>{const v=document.querySelector('video');return JSON.stringify({t:+v.currentTime.toFixed(1),rate:v.playbackRate,paused:v.paused})})()`));
  console.log(`  t=${s.t}/${d} rate=${s.rate}${s.paused ? ' PAUSED' : ''}`);
  if (s.rate !== RATE) await evl(`(()=>{const v=document.querySelector('video');v.playbackRate=${RATE};return 1})()`);
  if (d - s.t < 2 || (last > 60 && s.t < last - 10)) break;
  last = s.t;
}
console.log('片尾已到，studyVideo（还没关记录）=', await study());
console.log('现在导航离开（触发 updateEndTime）…');
await send('Page.navigate', { url: url(OTHER) });
await sleep(14000);
console.log('离开后 studyVideo =', await study());
await sleep(20000);
console.log('再等 20 秒后 studyVideo =', await study());
console.log('该视频逐条状态 =', await status());
ws.close();
process.exit(0);
