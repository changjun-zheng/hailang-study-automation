// 验 v0.4.1 的两条新逻辑，用的是**已经开着的那个** 9225 窗口（不再新开浏览器）：
//   ① clampSound：手动把 video.muted 改成 false，量面板多久按回去（旧版靠 1.2 秒轮询 = 他听到的外放）
//   ② dismissDialog + nextInCourse：他截图里那个「有习题：(2题) 待完成」弹窗现在就在页面上，
//      注入后面板的 3 秒循环应当点掉它的关闭按钮（不是「去练习」），并且跳到下一条视频。
//   node .cdp/panel-dialog.mjs
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9225';
const fs = await import('node:fs');
const SRC = 'hailang-panel.user.js';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('/MyCourse/Study'));
if (!tabs.length) { console.error('9225 上没有学习页'); process.exit(1); }
const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 160); return r.result?.value; };
const J = async (e) => JSON.parse(await evl(e));
await send('Page.enable');

const state = () => J(`JSON.stringify((()=>{const v=document.querySelector('video');
  const box=[...document.querySelectorAll('.el-message-box,.el-dialog')].find(b=>b.getBoundingClientRect().width>0);
  return{vid:new URLSearchParams(location.search).get('videoId'),cur:v?+v.currentTime.toFixed(1):-1,dur:v?Math.round(v.duration||0):-1,
  muted:v&&v.muted,box:box?(box.textContent||'').replace(/\\s+/g,' ').trim().slice(0,40):null,
  hasX:box?!!box.querySelector('.el-message-box__headerbtn,.el-message-box__close,.el-dialog__headerbtn'):false,
  ver:(window.__kgPanel||{}).version||null}})())`);

let s0 = await state();
console.log(`注入前：视频 ${s0.vid} 进度 ${s0.cur}/${s0.dur}，弹窗=${s0.box || '无'}，关闭按钮=${s0.hasX}`);

console.log('\n[1] 注入 v0.4.1 后量「静音被改回去」的延迟');
await evl(`(()=>{window.__kgBuilt=1;window.__kgPanel=null;const p=document.getElementById('kg-panel');if(p)p.remove();return 1})()`);
await evl(fs.readFileSync(SRC, 'utf8') + '\n;"ok"');
await sleep(2500);
let s1 = await state();
if (s1.ver !== '0.4.1') { console.error(`  页面上是 v${s1.ver}，作废`); process.exit(1); }
const lat = await J(`(async()=>{const v=document.querySelector('video');v.muted=false;
  const t0=performance.now();let waited=0;
  while(!v.muted&&waited<3000){await new Promise(r=>setTimeout(r,10));waited=performance.now()-t0;}
  return JSON.stringify({back:v.muted,ms:Math.round(performance.now()-t0)})})()`);
console.log(`  把 muted 改成 false 之后：${lat.back ? `面板在 ${lat.ms}ms 内按回静音` : `${lat.ms}ms 内没按回去（失败）`}`);

console.log('\n[2] 写入任务，让 3 秒循环去关弹窗并跳下一条');
await evl(`(async()=>{
  const t=localStorage.getItem('token2'),me=JSON.parse(localStorage.getItem('userInfo2')||'{}'),q=new URLSearchParams(location.search);
  const pd=await fetch('/gateway/system/orgStudent/progressDetails?studentId='+(me.studyNumber||me.id)+'&id='+q.get('id')+'&majorId='+me.majorId+'&studentCourseId='+q.get('studentCourseId')+'&version='+(q.get('version')||'BK_RJGC_2024'),{headers:{Authorization:t}}).then(r=>r.json());
  const vids=[];const walk=(n)=>{for(const v of (n.courseCatalogVideoVos||[]))vids.push({id:v.id,unitId:v.unitId||n.id,name:v.name});for(const k of (n.children||[]))walk(k)};
  (Array.isArray(pd.data)?pd.data:[]).forEach(walk);
  const i=vids.findIndex(x=>x.id===q.get('videoId'));
  const todo=i<0?vids.slice(0,2):[vids[i],vids[i+1]||vids[0]];
  localStorage.setItem('kg-job',JSON.stringify({stu:me.studyNumber||me.id,queue:[{id:q.get('id'),name:'这门课',sid:q.get('studentCourseId'),ver:q.get('version')||'BK_RJGC_2024'}],i:0,done:{},todo,baseHave:0,started:Date.now()}));
  return JSON.stringify({从:vids[i]&&vids[i].name,下一条:todo[1]&&todo[1].name})})()`);
console.log('  ' + (await evl(`(()=>{const j=JSON.parse(localStorage.getItem('kg-job'));return '任务：' + j.todo.map(x=>x.name).join(' → ')})()`)));
const marks = [];
for (let i = 1; i <= 8; i++) { await sleep(4000); const s = await state(); marks.push(s); console.log(`  +${i * 4}s 视频 ${s.vid} 进度 ${s.cur}/${s.dur} 弹窗=${s.box || '无'} v${s.ver}`); if (s.vid !== s0.vid) break; }
const moved = marks[marks.length - 1].vid !== s0.vid;
const gone = marks.some((m) => !m.box);
console.log(`\n判读：弹窗${gone ? '已被关掉 ✓' : '还在 ✗'}；${moved ? '已跳到下一条视频 ✓' : '没跳（若视频没到片尾，本来就不该跳）'}`);
ws.close(); process.exit(0);
