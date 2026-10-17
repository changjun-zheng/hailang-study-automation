// 干净版的自动顺播实验：不拖进度（拖了会让播放器停住，上一版就是这么废掉的），
// 挑一门课里最短的那条未记账视频，2 倍速让它自然播完，然后**完全不给输入**，看：
//   ① 站点会不会自己顺播到下一条
//   ② 顺播之后 haveTime 还涨不涨（涨 = 用户点一次就够；不涨 = 每条都要亲手点）
// 对照前提已单独验过：可信鼠标点站点播放键 → 心跳出现、haveTime 与真实观看秒数 1:1。
//   node .cdp/panel-autoadvance2.mjs
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9225';
const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('study.cqie.edu.cn'));
if (!tabs.length) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map(); const NET = { plans: 0 };
ws.onmessage = (e) => {
  const x = JSON.parse(e.data);
  if (x.method === 'Network.requestWillBeSent' && String(x.params?.request?.url || '').includes('updateStudyVideoPlan')) NET.plans++;
  if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); }
};
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 160); return r.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toSec = (t) => String(t || '0:0:0').split(':').reduce((a, p) => a * 60 + (parseInt(p, 10) || 0), 0);

const ver = await (await fetch(BASE + '/json/version')).json();
const bws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
const bp = new Map();
bws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && bp.has(x.id)) { const f = bp.get(x.id); bp.delete(x.id); f(x.result); } };
let bid = 0;
const bask = (method, params) => new Promise((r) => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
const w0 = await bask('Browser.getWindowForTarget', { targetId: tabs[0].id });
if (w0.bounds?.windowState === 'minimized') { await bask('Browser.setWindowBounds', { windowId: w0.windowId, bounds: { windowState: 'normal' } }); await sleep(1500); console.log('窗口原本最小化，已还原'); }
await send('Network.enable'); await send('Page.enable');

// 找全账号里最短的未记账视频（2 倍速下能最快跑到片尾）
const pick = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const G=(p)=>fetch(p,{headers:{Authorization:t}}).then(r=>r.json());
  const cs=await fetch('/gateway/frequent/orgStudent/pagedMyCourse',{method:'POST',headers:{Authorization:t,'Content-Type':'application/json'},body:JSON.stringify({filters:{courseNature:null,name:'',schoolYear:'',studentId:String(me.id),term:'',courseFlag:0},pageIndex:1,pageSize:50})}).then(r=>r.json());
  const cl=(cs.data&&(cs.data.records||cs.data.list))||[];
  let best=null;
  for(const c of cl){
    const sid=c.studentCourseId||c.id;
    const pd=await G('/gateway/system/orgStudent/progressDetails?studentId='+(me.studyNumber||me.id)+'&id='+c.id+'&majorId='+me.majorId+'&studentCourseId='+sid+'&version='+(c.version||'BK_RJGC_2024'));
    const vids=[]; const walk=(n)=>{ for(const v of (n.courseCatalogVideoVos||[])) vids.push({id:v.id,unitId:v.unitId||n.id,name:v.name,st:v.studyVideoStatus,len:v.timeLength||0}); for(const k of (n.children||[])) walk(k); };
    (Array.isArray(pd.data)?pd.data:[]).forEach(walk);
    for(const v of vids) if(v.st!==2 && v.len>=90 && v.len<=420 && (!best||v.len<best.len)) best={...v,cid:c.id,sid,ver:c.version||'BK_RJGC_2024',course:c.name};
  }
  return JSON.stringify(best?{ok:true,...best,total:1}:{ok:false})
})()`));
if (!pick.ok) { console.error('没找到 90~420 秒的未记账视频，手动指定一条再测'); process.exit(1); }
console.log(`选中：【${pick.course}】「${pick.name}」 ${pick.len}s（2 倍速约 ${Math.round(pick.len / 2)}s 播完）`);

const majorId = await evl('JSON.parse(localStorage.getItem("userInfo2")||"{}").majorId||""');
const url = `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=${pick.cid}&studentCourseId=${pick.sid}&version=${pick.ver}&courseUnitId=${pick.unitId}&majorId=${majorId}&videoId=${pick.id}`;
await send('Page.navigate', { url });
await sleep(13000);

const st = async () => JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const q=new URLSearchParams(location.search);
  const v=document.querySelector('video');
  const d=await fetch('/gateway/system/orgStudent/myCourseDetails?studentId='+(me.studyNumber||me.id)+'&id='+q.get('id')+'&majorId='+me.majorId+'&studentCourseId='+q.get('studentCourseId')+'&version='+(q.get('version')||'BK_RJGC_2024'),{headers:{Authorization:t}}).then(r=>r.json()).catch(()=>({}));
  return JSON.stringify({have:(d.data&&d.data.haveTime)||'0',cur:v?+v.currentTime.toFixed(1):-1,dur:v?v.duration:-1,paused:v?v.paused:null,vid:q.get('videoId'),rate:v?v.playbackRate:null})
})()`));

let s0 = await st();
console.log(`页面就绪：进度 ${s0.cur}/${s0.dur} paused=${s0.paused} haveTime=${s0.have}`);
const r = JSON.parse(await evl('JSON.stringify((()=>{const b=document.querySelector(".d-play-btn, [class*=play-btn]");if(!b)return{};const x=b.getBoundingClientRect();return{x:x.left+x.width/2,y:x.top+x.height/2,w:Math.round(x.width)}})())'));
if (!r.w) { console.error('播放按钮尺寸为 0，这轮作废'); process.exit(1); }
NET.plans = 0;
const have0 = (await st()).have;
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 0 });
await evl('(()=>{const v=document.querySelector("video"); if(v){try{v.playbackRate=2}catch(e){}} return 1})()');
console.log(`已可信点击播放键并设 2 倍速，等它自然播完（最多 300s）…`);

let done = false, prev = have0, samples = [];
for (let i = 1; i <= 15; i++) {
  await sleep(20000);
  const n = await st();
  const d = toSec(n.have) - toSec(prev); prev = n.have;
  samples.push({ i, d, vid: n.vid, paused: n.paused });
  const switched = String(n.vid) !== String(pick.id);
  console.log(`  +${i * 20}s ${switched ? '已顺播到下一条' : '还是这条'} 进度 ${n.cur}/${n.dur} paused=${n.paused} 倍速 ${n.rate} | haveTime +${d}s（累计 ${n.have}）| 心跳 ${NET.plans}`);
  if (switched) {
    console.log('\n→ 站点自己换了一条，之后不再给任何输入，观察记账会不会续上…');
    done = true; break;
  }
}
if (!done) { console.log(`\n? 300 秒内没看到顺播（这条 ${pick.len}s，可能还没到头）。已采到的增量：${samples.map((x) => x.d).join(', ')}`); process.exit(0); }

const before = (await st()).have;
NET.plans = 0;
let grew = [];
for (let i = 1; i <= 6; i++) {
  await sleep(20000);
  const n = await st();
  grew.push(toSec(n.have) - toSec(before));
  console.log(`  顺播后 +${i * 20}s 进度 ${n.cur}/${n.dur} paused=${n.paused} | haveTime 较换条时 +${toSec(n.have) - toSec(before)}s | 这 20s 心跳 ${NET.plans} 次`);
}
const last3 = grew.slice(-3).filter((x) => x > 0).length;
console.log(last3 >= 2
  ? '\n✓ 结论：用户点一次起播，站点顺播到下一条时记账会自己续上 —— 面板按"每单元点一下"设计就够用'
  : '\n✗ 结论：换到下一条后不再涨（也不再发心跳）—— 每条视频都得用户亲手点一下');
bws.close(); ws.close(); process.exit(0);
