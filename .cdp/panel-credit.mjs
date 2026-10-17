// 判「面板驱动的播放到底会不会被服务端记账」—— 不数请求，直接比 haveTime。
// 上一版数请求踩了两个坑（只包 fetch 量成 0、窗口比心跳周期短），这次换成平台自己认的那本账。
//   node .cdp/panel-credit.mjs            默认 3 分钟
//   node .cdp/panel-credit.mjs 6          观察 6 分钟
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9225';
const SECS = Number(process.argv[2] || 180);
import fs from 'node:fs';
import path from 'node:path';
const SRC = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'hailang-panel.user.js'), 'utf8');

const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('study.cqie.edu.cn'));
if (!tabs.length) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 160); return r.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toSec = (t) => String(t || '0:0:0').split(':').reduce((a, p) => a * 60 + (parseInt(p, 10) || 0), 0);

// 窗口最小化时渲染器被推迟，先还原（这是测试侧动作，面板自己从不碰窗口）
const ver = await (await fetch(BASE + '/json/version')).json();
const bws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
const bp = new Map();
bws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && bp.has(x.id)) { const f = bp.get(x.id); bp.delete(x.id); f(x.result); } };
let bid = 0;
const bask = (method, params) => new Promise((r) => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
const w0 = await bask('Browser.getWindowForTarget', { targetId: tabs[0].id });
if (w0.bounds?.windowState === 'minimized') { await bask('Browser.setWindowBounds', { windowId: w0.windowId, bounds: { windowState: 'normal' } }); console.log('窗口原本最小化，已还原'); await sleep(1500); }

await send('Page.enable');
// 找一条这门课里服务端还没记满的视频，导航过去
const target = JSON.parse(await evl(`(async()=>{
  const toSec=(t)=>String(t||'0:0:0').split(':').reduce((a,p)=>a*60+(parseInt(p,10)||0),0);
  const t=localStorage.getItem('token2');const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const G=(p)=>fetch(p,{headers:{Authorization:t}}).then(r=>r.json());
  const cs=await fetch('/gateway/frequent/orgStudent/pagedMyCourse',{method:'POST',headers:{Authorization:t,'Content-Type':'application/json'},body:JSON.stringify({filters:{courseNature:null,name:'前端框架',schoolYear:'',studentId:String(me.id),term:'',courseFlag:0},pageIndex:1,pageSize:10})}).then(r=>r.json());
  const c=((cs.data&&(cs.data.records||cs.data.list))||[])[0];
  if(!c) return JSON.stringify({err:'没有前端框架这门课'})
  const sid=c.studentCourseId||c.id;
  const pd=await G('/gateway/system/orgStudent/progressDetails?studentId='+(me.studyNumber||me.id)+'&id='+c.id+'&majorId='+me.majorId+'&studentCourseId='+sid+'&version='+c.version);
  const vids=[]; const walk=(n)=>{ for(const v of (n.courseCatalogVideoVos||[])) vids.push({id:v.id,unitId:v.unitId||n.id,name:v.name,st:v.studyVideoStatus,len:v.timeLength}); for(const k of (n.children||[])) walk(k); };
  (Array.isArray(pd.data)?pd.data:[]).forEach(walk);
  const todo=vids.filter(v=>v.st!==2);
  const d=await G('/gateway/system/orgStudent/myCourseDetails?studentId='+(me.studyNumber||me.id)+'&id='+c.id+'&majorId='+me.majorId+'&studentCourseId='+sid+'&version='+c.version);
  return JSON.stringify({cid:c.id,sid,ver:c.version,major:me.majorId,stu:me.studyNumber||me.id,have:toSec(d.data&&d.data.haveTime),sum:toSec(d.data&&d.data.sumTime),total:vids.length,todo:todo.length,t:todo[0]||null})
})()`));
if (target.err) { console.error(target.err); process.exit(1); }
console.log(`课程 ${target.total} 条视频、待播 ${target.todo} 条；服务端时长 ${target.have}/${target.sum}`);
if (!target.t) { console.log('这门课已记满，换一门有缺口的课再测'); process.exit(0); }

const url = `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=${target.cid}&studentCourseId=${target.sid}&version=${target.ver}&courseUnitId=${target.t.unitId}&majorId=${target.major}&videoId=${target.t.id}`;
console.log(`打开「${target.t.name}」（${target.t.len}s）…`);
await send('Page.navigate', { url });
await sleep(12000);

const have0 = await evl(`(async()=>{const t=localStorage.getItem('token2');const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');const d=await fetch('/gateway/system/orgStudent/myCourseDetails?studentId='+(me.studyNumber||me.id)+'&id=${target.cid}&majorId=${target.major}&studentCourseId=${target.sid}&version=${target.ver}',{headers:{Authorization:t}}).then(r=>r.json());return (d.data&&d.data.haveTime)||'0'})()`);
const base0 = toSec(have0);
console.log(`基线 haveTime = ${have0}（${base0}s）`);

await evl(SRC);
await sleep(1500);
const injected = await evl('!!document.getElementById("kg-panel") && !!window.__kgPanel');
console.log('面板已注入:', injected);
if (!injected) { console.error('面板没起来，先解决注入'); process.exit(1); }

const r = JSON.parse(await evl('JSON.stringify((()=>{const b=document.getElementById("kg-play");const x=b.getBoundingClientRect();return {x:x.left+x.width/2,y:x.top+x.height/2}})())'));
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1, buttons: 0 });
console.log(`已用可信鼠标点击面板「继续起播」@(${r.x.toFixed(0)},${r.y.toFixed(0)})，观察 ${SECS}s…`);

let last = null;
for (let i = 1; i * 20 <= SECS; i++) {
  await sleep(20000);
  last = JSON.parse(await evl(`(async()=>{
    const t=localStorage.getItem('token2');const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
    const v=document.querySelector('video');
    const d=await fetch('/gateway/system/orgStudent/myCourseDetails?studentId='+(me.studyNumber||me.id)+'&id=${target.cid}&majorId=${target.major}&studentCourseId=${target.sid}&version=${target.ver}',{headers:{Authorization:t}}).then(r=>r.json()).catch(()=>({}));
    return JSON.stringify({have:(d.data&&d.data.haveTime)||'?',cur:v?+v.currentTime.toFixed(1):-1,paused:v?v.paused:null,beats:(window.__kgPanel&&window.__kgPanel.G)?window.__kgPanel.G.beats:-1})
  })()`));
  const grew = toSec(last.have) - base0;
  console.log(`  +${i * 20}s 播放进度 ${last.cur}s、paused=${last.paused}、心跳 ${last.beats}、服务端 haveTime=${last.have}（较基线 ${grew >= 0 ? '+' : ''}${grew}s）`);
  if (grew >= 15) { console.log('\n✓ 判定：面板驱动的播放会被服务端记账 —— 油猴方案可以独立刷课'); break; }
}
if (last && toSec(last.have) - base0 < 15) console.log(`\n✗ 判定：${SECS}s 内服务端只涨了 ${toSec(last.have) - base0}s（播放进度 ${last.cur}s）—— 面板这条路没进组件状态机，得改成让用户亲手点播放键`);
bws.close(); ws.close(); process.exit(0);
