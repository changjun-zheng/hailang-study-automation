// 真人路径实验：不靠 URL 导航，而是**点课程目录**进视频、播一会儿、再点另一条目录切走。
// 目的：看 Vue 内部的目录切换会不会触发一个「URL 导航时不会出现」的写入调用。
// 目录条目是 div.name.pointer（有子节点，不是叶子 —— 上一版脚本就栽在只找叶子）。
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const fs = await import('node:fs');
const path = await import('node:path');
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEEP = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id;
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
const A = process.env.VID || '使用指令进行条件渲染-1';
const B = process.env.VID2 || '使用指令进行条件渲染-2';
const OUT = path.join(ROOT, '.cdp', 'human-path.txt');
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
const calls = [];
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && pend.has(x.id)) {
    const p = pend.get(x.id);
    pend.delete(x.id);
    x.error ? p.rej(new Error(x.error.message)) : p.res(x.result);
    return;
  }
  if (x.method === 'Network.requestWillBeSent') {
    const q = x.params.request;
    if (/\/gateway\//.test(q.url) && !/myCourseDetails|progressDetails|courseCatalog\/tree|listCatalog|listCourse|pagedMyCourse|myNote|xview|getVideoCloudUrl|studyVideo\?/.test(q.url)) {
      calls.push(`${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s ${q.method} ${decodeURIComponent(q.url).replace('https://study.cqie.edu.cn', '').slice(0, 90)}${q.postData ? '  body=' + q.postData.slice(0, 200) : ''}`);
    }
  }
};
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pend.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
let t0 = Date.now();
const evl = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
const api = (u) => `fetch(${JSON.stringify(u)}, {headers:{Authorization: localStorage.getItem('token2')}}).then(r=>r.json())`;
const study = (vid) => evl(`${api(`/gateway/system/orgStudent/studyVideo?studentCourseId=${SC}&videoId=${vid}&studentId=YOUR_STUDENT_ID&majorId=${MID}&version=BK_RJGC_2024`)}.then(j=>{const d=j.data||{};return JSON.stringify({studyTime:d.studyTime,startPos:d.startPos,stopPos:d.stopPos,maxCurrentPos:d.maxCurrentPos})})`);

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
// 必须注入油猴脚本：否则窗口不在前台时站点自己把视频暂停（第二次测试 t 卡在 2 秒就是这个问题），
// 那样"没写记录"是假阴性。
const SRC = fs.readFileSync(path.join(ROOT, 'hailang-background-play.user.js'), 'utf8');
await send('Page.addScriptToEvaluateOnNewDocument', { source: SRC });

// 拿到两条视频的 id
const mapExpr = `(async()=>{
    const A=localStorage.getItem('token2');
    const bs=await fetch('/gateway/system/orgStudent/listCourseBarrier?courseId=${CID}&majorId=${MID}&userId=YOUR_STUDENT_ID&version=BK_RJGC_2024&studentCourseId=${SC}',{headers:{Authorization:A}}).then(r=>r.json());
    const out={};
    for(const b of bs.data||[]){
      const n=await fetch('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId=${SC}',{headers:{Authorization:A}}).then(r=>r.json());
      for(const v of (n.data||[]).filter(x=>x.videoId)) out[v.catalogName]={videoId:v.videoId,unitId:v.id};
    }
    return JSON.stringify(out)
  })()`;
const map = JSON.parse(await evl(mapExpr));
if (!map[A] || !map[B]) {
  console.log('拿不到两条视频的 id', Object.keys(map).slice(0, 6));
  process.exit(1);
}
console.log(`A=${A} ${map[A].videoId.slice(0, 10)}…  B=${B} ${map[B].videoId.slice(0, 10)}…`);
console.log('A 开始前:', await study(map[A].videoId));

// ① 用 URL 打开 A（和 runner 一样）
t0 = Date.now();
await send('Page.navigate', { url: `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=${CID}&studentCourseId=${SC}&version=BK_RJGC_2024&courseUnitId=${map[A].unitId}&videoId=${map[A].videoId}&majorId=${MID}` });
await sleep(16000);
console.log('① URL 打开 A 之后 A:', await study(map[A].videoId));

// ② 起播 60 秒（1 倍速）
await evl(`(()=>{const v=document.querySelector('video');if(v){v.muted=true;v.playbackRate=1;return v.play().then(()=>1).catch(()=>0)}return 0})()`);
for (let i = 0; i < Number(process.env.SEC || 6); i++) {
  await sleep(10000);
  console.log(`   播 ${i + 1}0 秒 t=${(await evl(`(()=>{const v=document.querySelector('video');return v?+v.currentTime.toFixed(0):-1})()`))}`);
}
console.log('② 播了 60 秒之后 A:', await study(map[A].videoId));

// ③ 真人动作：点目录里的 B（Vue 内部切换，不走整页导航）
const box = JSON.parse(
  await evl(
    `(()=>{const els=[...document.querySelectorAll('div.name,div.item,.pointer')].filter(e=>(e.textContent||'').includes(${JSON.stringify(B)}));if(!els.length)return '{"ok":false,"n":0}';const e=els[0];e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return JSON.stringify({ok:true,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),n:els.length,txt:(e.textContent||'').replace(/\\s+/g,' ').trim().slice(0,50)})})()`
  )
);
console.log('③ 目录条目定位:', JSON.stringify(box));
if (box.ok) {
  const n = calls.length;
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: type === 'mousePressed' ? 'left' : 'none', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  }
  await sleep(12000);
  console.log('   点击后新增的 gateway 调用：\n  ' + (calls.slice(n).join('\n  ') || '（没有）'));
  console.log('   现在 URL =', (await evl('location.href')).slice(0, 150));
}
console.log('③ 点目录切走之后 A:', await study(map[A].videoId));
await sleep(45000);
console.log('再等 45 秒 A:', await study(map[A].videoId));
const p = JSON.parse(await evl(`${api(`/gateway/system/orgStudent/myCourseDetails?studentId=YOUR_STUDENT_ID&id=${CID}&majorId=${MID}&studentCourseId=${SC}&version=BK_RJGC_2024`)}.then(j=>JSON.stringify({haveTime:j.data.haveTime}))`));
console.log('课程已记时长 =', p.haveTime);
console.log('\n全程非轮询 gateway 调用汇总：\n  ' + (calls.join('\n  ') || '（一条都没有）'));
ws.close();
process.exit(0);
