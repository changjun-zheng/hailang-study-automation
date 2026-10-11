// 对照实验：一条视频只用 1 倍速完整播完，看服务端的 haveTime 会不会出现。
// 背景：2 倍速播完的 12 条 haveTime 全为空，1 倍速播完的 5 条 haveTime == 片长。
// 用法：node .cdp/test-1x-credit.mjs [--rate 1]
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'hailang-background-play.user.js'), 'utf8');
const LOCK = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const RATE = Number(arg('--rate', 1));
const TARGET = '使用生命周期函数-2';

const pages = await (await fetch(BASE + '/json/list')).json();
const t = pages.find((x) => x.id === LOCK && x.type === 'page');
if (!t) {
  console.error('找不到 runner 标签页');
  process.exit(1);
}
const ws = new WebSocket(t.webSocketDebuggerUrl);
const pend = new Map();
let seq = 0;
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(new Error('ws 失败'));
  ws.onmessage = (m) => {
    const x = JSON.parse(m.data);
    if (x.id && pend.has(x.id)) {
      const p = pend.get(x.id);
      pend.delete(x.id);
      x.error ? p.rej(new Error(x.error.message)) : p.res(x.result);
    }
  };
});
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

await send('Page.enable');
await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: SRC });

// 解析课程 + 第一关的视频清单，拿到目标视频的 unitId/videoId
const ids = JSON.parse(await evl(`JSON.stringify((()=>{const u=JSON.parse(localStorage.getItem('userInfo2')||'{}');return {id:u.id||'',majorId:u.majorId||''}})())`));
const course = JSON.parse(
  await evl(
    `fetch('/gateway/frequent/orgStudent/pagedMyCourse',{method:'POST',headers:{'Content-Type':'application/json',Authorization:localStorage.getItem('token2')},body:JSON.stringify({filters:{courseNature:null,name:'',schoolYear:'',studentId:${JSON.stringify(ids.id)},term:'',courseFlag:0},pageIndex:1,pageSize:50})}).then(r=>r.json()).then(j=>JSON.stringify((j.data.records||[]).find(c=>(c.name||'').includes('前端框架'))))`
  )
);
if (!course) {
  console.error('没找到课程');
  process.exit(1);
}
const bs = await evl(`${get(`/gateway/system/orgStudent/listCourseBarrier?courseId=${course.id}&majorId=${ids.majorId}&userId=${ids.id}&version=${course.version}&studentCourseId=${course.studentCourseId}`)}.then(j=>JSON.stringify(j.data))`);
const barrier = JSON.parse(bs)[0];
const vids = JSON.parse(
  await evl(`${get(`/gateway/system/orgStudent/listCatalogBarrier?barrierId=${barrier.id}&studentCourseId=${course.studentCourseId}`)}.then(j=>JSON.stringify((j.data||[]).filter(n=>n.videoId).map(n=>({unitId:n.id,videoId:n.videoId,name:n.catalogName,seconds:n.timeLength}))))`)
);
const v = vids.find((x) => x.name === TARGET) || vids.find((x) => x.name.includes('生命周期'));
console.log(`目标视频 = ${v.name} ${v.seconds}s videoId=${v.videoId}`);

// 先看服务端现在记成什么
const before = await evl(
  `${get(`/gateway/system/orgStudent/progressDetails?studentId=${ids.id}&id=${course.id}&majorId=${ids.majorId}&studentCourseId=${course.studentCourseId}&version=${course.version}`)}.then(j=>{const hit=[];(function w(ns){for(const n of ns||[]){for(const x of (n.courseCatalogVideoVos||[])){if(x.name&&x.name.includes('${v.name}'))hit.push([x.name,x.timeLength,x.haveTime])}w(n.children)}})(j.data);return JSON.stringify(hit)})`
);
console.log('服务端记录（改之前）:', before);

const url = `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=${course.id}&studentCourseId=${course.studentCourseId}&version=${course.version}&courseUnitId=${v.unitId}&videoId=${v.videoId}&majorId=${ids.majorId}`;
await send('Page.navigate', { url });
let st = null;
for (let i = 0; i < 30; i++) {
  await sleep(1000);
  st = await evl(`(()=>{const v=document.querySelector('video');return v?JSON.stringify({d:+(v.duration||0).toFixed(1),t:+v.currentTime.toFixed(1),rate:v.playbackRate}):null})()`);
  if (st && JSON.parse(st).d > 0) break;
}
console.log('页面就绪:', st);

// 用脚本自己的逃生门把倍速钉死：先报一次"他动过手"，再把 rate 设成目标值，脚本就会放手
await evl(`document.dispatchEvent(new Event('pointerdown'))`);
await evl(`(()=>{const v=document.querySelector('video');v.muted=true;v.playbackRate=${RATE};return v.play().then(()=>'ok').catch(e=>'rej:'+e.name)})()`);
console.log(`已钉到 ${RATE} 倍速，开始完整播放`);

let last = -1, ended = false;
for (let i = 0; i < 90; i++) {
  await sleep(10000);
  const s = JSON.parse(await evl(`(()=>{const v=document.querySelector('video');return JSON.stringify({t:+v.currentTime.toFixed(1),d:+(v.duration||0).toFixed(1),rate:v.playbackRate,paused:v.paused,ended:v.ended})})()`));
  process.stdout.write(`  +${(i + 1) * 10}s t=${s.t}/${s.d} rate=${s.rate}${s.paused ? ' PAUSED' : ''}\n`);
  if (s.ended || s.d - s.t < 1.5 || (last > 30 && s.t < last - 10)) {
    ended = true;
    console.log(`  片尾到了（ended=${s.ended}，上一轮 ${last} → 这一轮 ${s.t}）`);
    break;
  }
  last = s.t;
}
await sleep(12000);
const after = await evl(
  `${get(`/gateway/system/orgStudent/progressDetails?studentId=${ids.id}&id=${course.id}&majorId=${ids.majorId}&studentCourseId=${course.studentCourseId}&version=${course.version}`)}.then(j=>{const hit=[];(function w(ns){for(const n of ns||[]){for(const x of (n.courseCatalogVideoVos||[])){if(x.name&&x.name.includes('${v.name}'))hit.push([x.name,x.timeLength,x.haveTime])}w(n.children)}})(j.data);return JSON.stringify(hit)})`
);
console.log('\n服务端记录（1 倍速播完之后）:', after);
console.log(ended ? '本次完整播到了片尾' : '⚠️ 没观察到片尾，本次不作判定');
ws.close();
process.exit(0);
