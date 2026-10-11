// 最接近真人的复现：**完全不注入油猴脚本**，全程只用 trusted 鼠标点击。
// 目的：一次排除两个变量 —— ①脚本伪造 document.visibilityState 被反作弊识别；②URL 直达绕过了页面自己的进入逻辑。
// 无头模式下页面本来就报 visible，所以不注入脚本也不会被暂停。
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const fs = await import('node:fs');
const path = await import('node:path');
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEEP = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id;
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
const A = process.env.VID || '使用路由守卫-1';
const B = process.env.VID2 || '使用路由守卫-2';
const SEC = Number(process.env.SEC || 70);
const OUT = path.join(ROOT, '.cdp', 'real-human.txt');
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
    if (/\/gateway\//.test(q.url) && !/myCourseDetails|progressDetails|courseCatalog\/tree|listCatalog|listCourse|pagedMyCourse|myNote|xview|getVideoCloudUrl|studyVideo\?|orgStudent\/study/.test(q.url)) {
      calls.push(`${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s ${q.method} ${decodeURIComponent(q.url).replace('https://study.cqie.edu.cn', '').slice(0, 80)}`);
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

// 定位一个「文本匹配、在视口内」的元素，返回中心坐标
const findBox = (text, sel) =>
  evl(
    `(()=>{const want=${JSON.stringify(text)};const sel=${JSON.stringify(sel || '')};
      let els=[...document.querySelectorAll(sel||'*')].filter(e=>e.childElementCount<=2&&(e.textContent||'').includes(want)&&(e.textContent||'').length<want.length+40);
      if(!els.length)els=[...document.querySelectorAll(sel||'*')].filter(e=>(e.textContent||'').includes(want)&&e.getBoundingClientRect().height>0&&e.getBoundingClientRect().height<200);
      if(!els.length)return JSON.stringify({ok:false,total:document.querySelectorAll(sel||'*').length});
      els.sort((a,b)=>a.getBoundingClientRect().height-b.getBoundingClientRect().height);
      const e=els[0];e.scrollIntoView({block:'center'});
      const r=e.getBoundingClientRect();
      return JSON.stringify({ok:true,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),txt:(e.textContent||'').replace(/\\s+/g,' ').trim().slice(0,50),h:Math.round(r.height)})})()`
  );
async function click(text, sel, label) {
  const b = JSON.parse(await findBox(text, sel));
  if (!b.ok) {
    console.log(`   ✗ ${label}：找不到「${text}」`);
    return false;
  }
  await sleep(300);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: type === 'mousePressed' ? 'left' : 'none', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  }
  console.log(`   ✓ ${label}：点了「${b.txt}」@(${b.x},${b.y})`);
  return true;
}
const study = (vid) => evl(`${api(`/gateway/system/orgStudent/studyVideo?studentCourseId=${SC}&videoId=${vid}&studentId=YOUR_STUDENT_ID&majorId=${MID}&version=BK_RJGC_2024`)}.then(j=>{const d=j.data||{};return JSON.stringify({studyTime:d.studyTime,startPos:d.startPos,stopPos:d.stopPos,maxCurrentPos:d.maxCurrentPos})})`);

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');

const map = JSON.parse(
  await evl(`(async()=>{const A=localStorage.getItem('token2');
    const bs=await fetch('/gateway/system/orgStudent/listCourseBarrier?courseId=${CID}&majorId=${MID}&userId=YOUR_STUDENT_ID&version=BK_RJGC_2024&studentCourseId=${SC}',{headers:{Authorization:A}}).then(r=>r.json());
    const out={};
    for(const b of bs.data||[]){const n=await fetch('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId=${SC}',{headers:{Authorization:A}}).then(r=>r.json());
      for(const v of (n.data||[]).filter(x=>x.videoId)) out[v.catalogName]={videoId:v.videoId,unitId:v.id};}
    return JSON.stringify(out)})()`)
);
if (!map[A] || !map[B]) {
  console.log('目录里找不到', A, B);
  process.exit(1);
}
console.log(`\n===== 真人复现（不注入任何脚本）A=${A} =====`);
console.log('A 开始前:', await study(map[A].videoId));

t0 = Date.now();
// ① 像人一样从学习页进这门课（只加载课程页，不带 videoId）
await send('Page.navigate', { url: `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=${CID}&studentCourseId=${SC}&version=BK_RJGC_2024&majorId=${MID}` });
await sleep(12000);
console.log('① 进课程页后 URL =', (await evl('location.href')).slice(0, 120));

// ② 点目录里的 A
const n1 = calls.length;
await click(A, 'div.name', `② 点目录「${A}」`);
await sleep(9000);
console.log('   点击后的 gateway 调用：\n  ' + (calls.slice(n1).join('\n  ') || '（没有）'));
const st = await evl(`(()=>{const v=document.querySelector('video');return v?JSON.stringify({d:+(v.duration||0).toFixed(1),t:+v.currentTime.toFixed(1),paused:v.paused,rate:v.playbackRate}):'NOVIDEO'})()`);
console.log('   视频元素状态:', st);

// ③ 真人会点一下播放键
const n2 = calls.length;
const pb = JSON.parse(await evl(`(()=>{const v=document.querySelector('video');if(!v)return '{"ok":false}';v.muted=true;const r=v.getBoundingClientRect();return JSON.stringify({ok:true,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)})})()`));
if (pb.ok) {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: pb.x, y: pb.y, button: type === 'mousePressed' ? 'left' : 'none', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  }
  console.log(`③ 已真实点击视频画面中心 (${pb.x},${pb.y}) 起播`);
}
await sleep(SEC * 1000);
console.log(`   等了 ${SEC} 秒，视频状态:`, await evl(`(()=>{const v=document.querySelector('video');return v?JSON.stringify({t:+v.currentTime.toFixed(1),paused:v.paused,rate:v.playbackRate}):'NOVIDEO'})()`));
console.log('   此时 A:', await study(map[A].videoId));

// ④ 点目录切走
const n3 = calls.length;
await click(B, 'div.name', `④ 点目录切到「${B}」`);
await sleep(12000);
console.log('   切走时新增调用：\n  ' + (calls.slice(n3).join('\n  ') || '（没有）'));
console.log('⑤ 切走后 A:', await study(map[A].videoId));
await sleep(40000);
console.log('   再等 40 秒 A:', await study(map[A].videoId));
const p = JSON.parse(await evl(`${api(`/gateway/system/orgStudent/myCourseDetails?studentId=YOUR_STUDENT_ID&id=${CID}&majorId=${MID}&studentCourseId=${SC}&version=BK_RJGC_2024`)}.then(j=>JSON.stringify({haveTime:j.data.haveTime,ptr:j.data.courseVideoId}))`));
console.log(`课程已记时长 = ${p.haveTime}  指针=${String(p.ptr).slice(0, 10)}…`);
ws.close();
process.exit(0);
