// 验一件事：真人「点课程目录里的视频条目」会不会创建服务端学习记录，而 runner 的直接 URL 导航不会。
// 做法：同一个标签页里 ①先按 runner 的方式导航过去，记录网络请求；②再用 trusted 点击点目录里的那一条，
//      再记录一次网络请求；③最后回读 studyVideo 看记录有没有被创建。
// 需要独占标签页：跑之前先 stop-jobs.ps1。
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEEP = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id;
const TARGET = process.argv[2] || '使用生命周期函数-2';

const list = await (await fetch(BASE + '/json/list')).json();
const full = list.find((t) => t.id === KEEP && t.type === 'page');
if (!full) {
  console.error('找不到 runner 标签页');
  process.exit(1);
}
const ws = new WebSocket(full.webSocketDebuggerUrl);
const pend = new Map();
let seq = 0;
await new Promise((r) => (ws.onopen = r));
let reqs = [];
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
    if (/\.(js|css|png|jpe?g|gif|svg|woff2?|ttf|ico|map)(\?|$)/i.test(u) || u.startsWith('data:')) return;
    reqs.push(`${x.params.request.method} ${u.replace('https://', '').slice(0, 110)}`);
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
const api = (u) => `fetch(${JSON.stringify(u)}, {headers:{Authorization: localStorage.getItem('token2')}}).then(r=>r.json())`;

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');

const prof = JSON.parse(await evl(`JSON.stringify((()=>{const u=JSON.parse(localStorage.getItem('userInfo2')||'{}');return {id:u.id||'',majorId:u.majorId||''}})())`));
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const bs = JSON.parse(await evl(`${api('/gateway/system/orgStudent/listCourseBarrier?courseId=e8716aab5bc18a56b115d3303f43555c&majorId=' + prof.majorId + '&userId=' + prof.id + '&version=BK_RJGC_2024&studentCourseId=' + SC)}.then(j=>JSON.stringify(j.data))`).catch(() => '[]'));
let node = null;
for (const b of bs) {
  const vids = JSON.parse(await evl(`${api(`/gateway/system/orgStudent/listCatalogBarrier?barrierId=${b.id}&studentCourseId=${SC}`)}.then(j=>JSON.stringify((j.data||[]).filter(n=>n.videoId).map(n=>({unitId:n.id,videoId:n.videoId,name:n.catalogName}))))`));
  vids.forEach((v) => (v.barrier = b.id));
  node = vids.find((v) => v.name === TARGET);
  if (node) break;
}
if (!node) {
  console.error('找不到目标视频');
  process.exit(1);
}
const rec = async (label) => {
  const r = JSON.parse(await evl(`${api(`/gateway/system/orgStudent/studyVideo?studentCourseId=${SC}&videoId=${node.videoId}`)}.then(j=>JSON.stringify({studyTime:j.data&&j.data.studyTime,maxCurrentPos:j.data&&j.data.maxCurrentPos,startPos:j.data&&j.data.startPos,stopPos:j.data&&j.data.stopPos}))`));
  console.log(`  [${label}] studyVideo = ${JSON.stringify(r)}`);
  return r;
};
console.log(`目标 = ${TARGET} videoId=${node.videoId.slice(0, 12)}…`);
await rec('开始前');

// ① 像 runner 那样直接导航过去
reqs = [];
const url = `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=e8716aab5bc18a56b115d3303f43555c&studentCourseId=${SC}&version=BK_RJGC_2024&courseUnitId=${node.unitId}&videoId=${node.videoId}&majorId=${prof.majorId}`;
await send('Page.navigate', { url });
await sleep(14000);
const navReqs = [...reqs];
console.log(`\n① 直接 URL 导航：抓到 ${navReqs.length} 条请求，其中非轮询/非媒体的写操作候选：`);
console.log(navReqs.filter((r) => !/progressDetails|myCourseDetails|\.mp4|getVideoCloudUrl|listCatalog|listCourse|pagedMyCourse|myNote|studyVideo\?|courseCloud|view\/|xview/.test(r)).join('\n') || '   （没有）');
await rec('导航之后');

// ② 真人式：在课程目录里找到这条视频的条目，滚动到视口，trusted 点击
const box = JSON.parse(
  await evl(
    `(()=>{const els=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.textContent||'').includes(${JSON.stringify(TARGET)}));if(!els.length)return '{"ok":false}';const e=els[0];e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return JSON.stringify({ok:true,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),txt:(e.textContent||'').trim().slice(0,60)})})()`
  )
);
if (!box.ok) {
  console.log('\n② 目录里找不到该视频的条目文本，测试到此');
  process.exit(0);
}
await sleep(600);
reqs = [];
for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
  await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: type === 'mousePressed' ? 'left' : 'none', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
}
console.log(`\n② 已 trusted 点击目录条目「${box.txt}」，等 14 秒看网络…`);
await sleep(14000);
const clickReqs = reqs.filter((r) => !/progressDetails|myCourseDetails|\.mp4|getVideoCloudUrl|listCatalog|listCourse|pagedMyCourse|myNote|courseCloud|view\/|xview/.test(r));
console.log(`   点击后共 ${reqs.length} 条请求，非轮询候选 ${clickReqs.length} 条：`);
console.log(clickReqs.join('\n') || '   （没有）');
await sleep(4000);
const after = await rec('点击之后');
console.log(`\n判定：${after.maxCurrentPos === null ? '点击也没有创建记录 → 写记录的不是页面动作' : '点击创建了记录 → runner 缺的就是这一步（导航后必须点目录）'}`);
ws.close();
process.exit(0);
