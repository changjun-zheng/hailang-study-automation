// 他报的现象：很多视频差 1 秒没看完，要人工拖到最后看一眼才显示完成。
// 这个探针回答两个问题：① 这种"差几秒"的到底有多少条（先量规模，别凭感觉修）；
// ② 把 currentTime 按到最后一帧，服务端会不会就记成完成、播放器会不会因此停住。
// 只读 + 一条视频上做实验，不批量写。
//   node .cdp/test-tail-seek.mjs [软件系统分析与设计]
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9226';
const COURSE = process.argv[2] || '软件系统分析与设计';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function conn() {
  const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('study.cqie.edu.cn'));
  if (!tabs.length) throw new Error('没有 study 标签页');
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const pend = new Map();
  ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.method === 'Network.requestWillBeSent' && String(x.params?.request?.url || '').includes('updateStudyVideoPlan')) (ws.__hb = (ws.__hb || 0) + 1); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
  const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); try { ws.send(JSON.stringify({ id, method: m, params: p })); } catch (e) { pend.delete(id); rej(e); } });
  const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.exception?.description || '').slice(0, 160); return r.result?.value; };
  return { ws, send, evl, J: async (e) => JSON.parse(await evl(e)), url: tabs[0].url, id: tabs[0].id };
}
const c = await conn();
await c.send('Page.enable'); await c.send('Network.enable');

// ① 先量规模：这门课里有多少条是"差 1~10 秒"的
const scan = await c.J(`(async()=>{
  const t=localStorage.getItem('token2'),me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const G=(p)=>fetch(p,{headers:{Authorization:t}}).then(r=>r.json());
  const cs=await fetch('/gateway/frequent/orgStudent/pagedMyCourse',{method:'POST',headers:{Authorization:t,'Content-Type':'application/json'},body:JSON.stringify({filters:{courseNature:null,name:'',schoolYear:'',studentId:String(me.id),term:'',courseFlag:0},pageIndex:1,pageSize:50})}).then(r=>r.json());
  const c=((cs.data&&(cs.data.records||cs.data.list))||[]).find(x=>String(x.name||'').includes(${JSON.stringify(COURSE)}));
  if(!c)return JSON.stringify({err:'没这门课'});
  const sid=c.studentCourseId||c.id,ver=c.version||'BK_RJGC_2024';
  const pd=await G('/gateway/system/orgStudent/progressDetails?studentId='+(me.studyNumber||me.id)+'&id='+c.id+'&majorId='+me.majorId+'&studentCourseId='+sid+'&version='+ver);
  const toS=(x)=>String(x||'0:0:0').split(':').reduce((a,p)=>a*60+(parseInt(p,10)||0),0);
  const vids=[];const walk=(n)=>{for(const v of (n.courseCatalogVideoVos||[]))vids.push({id:v.id,unitId:v.unitId||n.id,name:v.name,len:v.timeLength||0,have:toS(v.haveTime),st:v.studyVideoStatus});for(const k of (n.children||[]))walk(k)};
  (Array.isArray(pd.data)?pd.data:[]).forEach(walk);
  const tail=vids.filter(v=>v.len&&v.have>0&&v.len-v.have<=10&&v.len-v.have>0);
  const zero=vids.filter(v=>v.len&&v.have===0).length;
  return JSON.stringify({课:c.name,cid:c.id,sid,ver,条数:vids.length,带perVideoHave:vids.filter(v=>v.have>0).length,差1到10秒:tail.map(v=>({id:v.id,unitId:v.unitId,name:v.name,left:v.len-v.have,len:v.len})),全零条数:zero})})()`);
if (scan.err) { console.error(scan.err); process.exit(1); }
console.log(`【${scan.课}】共 ${scan.条数} 条视频，其中 per-video haveTime 有值的 ${scan.带perVideoHave} 条、恒为 0 的 ${scan.全零条数} 条`);
console.log(`差 1~10 秒的：${scan.差1到10秒.length} 条` + (scan.差1到10秒.length ? '：' + scan.差1到10秒.map((x) => `${x.name}=${x.left}s`).join(' / ') : ''));
if (!scan.差1到10秒.length) { console.log('\n这门课没有"差几秒"的样本（也可能这类课的 per-video haveTime 恒为 0，测不出来），换一门课再跑'); process.exit(0); }

const tgt = scan.差1到10秒[0];
console.log(`\n拿「${tgt.name}」（差 ${tgt.left}s）做实验`);
const u = await c.J(`JSON.stringify((()=>{const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');return{sid:new URLSearchParams(location.search).get('studentCourseId'),cid:new URLSearchParams(location.search).get('id'),ver:new URLSearchParams(location.search).get('version')||'BK_RJGC_2024',major:me.majorId}})())`);
await c.send('Page.navigate', { url: `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=${scan.cid}&studentCourseId=${scan.sid}&version=${scan.ver}&courseUnitId=${tgt.unitId}&majorId=${u.major}&videoId=${tgt.id}` });
await sleep(14000);
// 用面板同一招起播：打在 elementFromPoint 命中的元素上
const hit = await c.J(`JSON.stringify((()=>{const b=document.querySelector('.d-play-btn, [class*=play-btn]')||document.querySelector('video');const x=b.getBoundingClientRect();
  const cx=x.left+x.width/2,cy=x.top+x.height/2;const e=document.elementFromPoint(cx,cy)||b;
  for(const t of ['pointerover','pointerdown','mousedown','pointerup','mouseup','click']){const E=t.startsWith('pointer')?PointerEvent:MouseEvent;e.dispatchEvent(new E(t,{bubbles:true,cancelable:true,view:window,clientX:cx,clientY:cy}));}
  return{hit:e.tagName+'.'+String(e.className).slice(0,24)}})())`);
await sleep(6000);
const s1 = await c.J(`JSON.stringify((()=>{const v=document.querySelector('video');return{paused:v.paused,cur:+v.currentTime.toFixed(1),dur:+(v.duration||0).toFixed(1)}})())`);
console.log(`起播（${hit.hit}）：${s1.paused ? '停着' : '在播'} ${s1.cur}/${s1.dur}`);
c.ws.__hb = 0;
console.log(`\n现在把指针按到最后一帧（模拟他手动拖到最后看一眼）`);
const seek = await c.J(`JSON.stringify((()=>{const v=document.querySelector('video');const t=Math.max(0,(v.duration||0)-0.05);v.currentTime=t;return{seekTo:+t.toFixed(2),paused:v.paused}})())`);
const marks = [];
for (let i = 1; i <= 8; i++) {
  await sleep(5000);
  const s = await c.J(`JSON.stringify((()=>{const v=document.querySelector('video');return{paused:v.paused,cur:+v.currentTime.toFixed(1),dur:+(v.duration||0).toFixed(1),ended:v.ended}})())`);
  marks.push(s);
  console.log(`  +${i * 5}s ${s.paused ? '停' : '播'} 进度 ${s.cur}/${s.dur} ended=${s.ended}｜这 5 秒心跳 ${c.ws.__hb} 次`);
  c.ws.__hb = 0;
}
const re = await c.J(`(async()=>{const t=localStorage.getItem('token2'),me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const pd=await fetch('/gateway/system/orgStudent/progressDetails?studentId='+(me.studyNumber||me.id)+'&id=${u.cid}&majorId='+me.majorId+'&studentCourseId=${u.sid}&version=${u.ver}',{headers:{Authorization:t}}).then(r=>r.json()).catch(e=>({}));
  const toS=(x)=>String(x||'0:0:0').split(':').reduce((a,p)=>a*60+(parseInt(p,10)||0),0);
  let v=null;const walk=(n)=>{for(const q of (n.courseCatalogVideoVos||[]))if(q.id===${JSON.stringify(tgt.id)})v={have:toS(q.haveTime),len:q.timeLength||0,st:q.studyVideoStatus};for(const k of (n.children||[]))walk(k)};
  (Array.isArray(pd.data)?pd.data:[]).forEach(walk);
  return JSON.stringify(v||{err:'没读到这条'})})()`);
console.log(`\n服务端现在记的：${JSON.stringify(re)}`);
const survived = marks.every((m) => m.paused === false || m.cur >= (marks[0].dur || 0) - 1);
console.log(`判读：快进后播放器${survived ? '没被搞停 ✓' : '停了/不动了 ✗'}；这条${re.have && re.len && re.have >= re.len - 1 ? '已记满 ✓' : '还没记满（' + (re.have || 0) + '/' + (re.len || 0) + '）'}`);
c.ws.close(); process.exit(0);
