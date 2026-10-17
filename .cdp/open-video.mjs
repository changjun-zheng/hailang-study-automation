// 把实例的第一个标签导航到「某条还没记满的视频」的学习页，给其它探针当起点。
//   node .cdp/open-video.mjs            默认 9225
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9225';
const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
if (!tabs.length) { console.error('没标签'); process.exit(1); }
const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 160); return r.result?.value; };
await send('Page.enable');
const pick = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');if(!t)return JSON.stringify({ok:false,why:'没有 token2，会话过期'});
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const G=(p)=>fetch(p,{headers:{Authorization:t}}).then(r=>r.json());
  const cs=await fetch('/gateway/frequent/orgStudent/pagedMyCourse',{method:'POST',headers:{Authorization:t,'Content-Type':'application/json'},body:JSON.stringify({filters:{courseNature:null,name:'',schoolYear:'',studentId:String(me.id),term:'',courseFlag:0},pageIndex:1,pageSize:50})}).then(r=>r.json());
  if(!cs.data)return JSON.stringify({ok:false,why:'接口没返回课程：'+String(cs.msg||cs.code||'').slice(0,40)});
  const cl=(cs.data&&(cs.data.records||cs.data.list))||[];let best=null;
  for(const c of cl){
    const sid=c.studentCourseId||c.id;
    const d=await G('/gateway/system/orgStudent/myCourseDetails?studentId='+(me.studyNumber||me.id)+'&id='+c.id+'&majorId='+me.majorId+'&studentCourseId='+sid+'&version='+(c.version||'BK_RJGC_2024'));
    const toSec=(x)=>String(x||'0:0:0').split(':').reduce((a,p)=>a*60+(parseInt(p,10)||0),0);
    if(toSec(d.data&&d.data.sumTime)-toSec(d.data&&d.data.haveTime)<60)continue;
    const pd=await G('/gateway/system/orgStudent/progressDetails?studentId='+(me.studyNumber||me.id)+'&id='+c.id+'&majorId='+me.majorId+'&studentCourseId='+sid+'&version='+(c.version||'BK_RJGC_2024'));
    const vids=[];const walk=(n)=>{for(const v of (n.courseCatalogVideoVos||[]))vids.push({id:v.id,unitId:v.unitId||n.id,name:v.name,len:v.timeLength||0,haveTime:v.haveTime});for(const k of (n.children||[]))walk(k)};
    (Array.isArray(pd.data)?pd.data:[]).forEach(walk);
    // 判据用**每条视频自己的 haveTime**（progressDetails 的视频节点带这个字段，实测 2010-1 是
    // 339s / 00:05:39 = 记满）。之前拿关卡接口的 status 筛，既漏顶层关卡又拿不到"记了几秒"。
    const toS=(x)=>String(x||'0:0:0').split(':').reduce((a,p)=>a*60+(parseInt(p,10)||0),0);
    for(const v of vids) if(v.len>=90&&v.len<=600&&toS(v.haveTime)<v.len-2&&!/课程介绍|绪论|导学/.test(v.name)&&v.name!==${JSON.stringify(process.env.EXCL || '')}&&(!best||v.len<best.len)) best={...v,cid:c.id,sid,ver:c.version||'BK_RJGC_2024',course:c.name,have:toS(v.haveTime)};
  }
  return JSON.stringify(best?{ok:true,...best,stu:me.studyNumber||me.id,major:me.majorId}:{ok:false,why:'没枚举到有缺口课里的 90~600 秒视频'})
})()`));
if (!pick.ok) { console.error('失败：' + pick.why); process.exit(1); }
const url = `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=${pick.cid}&studentCourseId=${pick.sid}&version=${pick.ver}&courseUnitId=${pick.unitId}&majorId=${pick.major}&videoId=${pick.id}`;
console.log(`账号 ${pick.stu} →【${pick.course}】「${pick.name}」 ${pick.len}s 已记=${pick.have}s/${pick.len}s`);
await send('Page.navigate', { url });
await new Promise((r) => setTimeout(r, 13000));
console.log('已导航：' + url.slice(0, 96) + '…');
console.log(await evl(`JSON.stringify((()=>{const v=document.querySelector('video');return v?{有video:1,dur:+(v.duration||0).toFixed(0),paused:v.paused}:('没有 video：'+location.pathname)})())`));
ws.close(); process.exit(0);
