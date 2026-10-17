// 只读：progressDetails 里每条视频到底带没带「服务端是否已学完」的字段、取值分布如何。
// 面板报「41 条里待播 41 条」，可界面上明明有「已完成」，怀疑我用的 studyVideoStatus 在这棵树里根本不是那个含义。
//   node .cdp/tree-status.mjs
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9225';
const EXPR = `(async()=>{
  const t=localStorage.getItem('token2');const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const cs=await fetch('/gateway/frequent/orgStudent/pagedMyCourse',{method:'POST',headers:{Authorization:t,'Content-Type':'application/json'},body:JSON.stringify({filters:{courseNature:null,name:'前端框架',schoolYear:'',studentId:String(me.id),term:'',courseFlag:0},pageIndex:1,pageSize:10})}).then(r=>r.json());
  const c=((cs.data&&(cs.data.records||cs.data.list))||[])[0];
  if(!c) return JSON.stringify({err:'no-course'})
  const sid=c.studentCourseId||c.id;
  const pd=await fetch('/gateway/system/orgStudent/progressDetails?studentId='+(me.studyNumber||me.id)+'&id='+c.id+'&majorId='+me.majorId+'&studentCourseId='+sid+'&version='+c.version,{headers:{Authorization:t}}).then(r=>r.json());
  const vids=[]; const walk=(n)=>{ for(const v of (n.courseCatalogVideoVos||[])) vids.push(v); for(const k of (n.children||[])) walk(k); };
  (Array.isArray(pd.data)?pd.data:[]).forEach(walk);
  const tally={};
  for(const v of vids){ const h=Number(v.haveTime||0), tt=Number(v.time||v.timeLength||0); const k='have '+h+' / time '+tt+' → '+(tt>0&&h>=tt-1?'看完':(tt>0?Math.round(h/tt*100)+'%':'无时长')); tally[k]=(tally[k]||0)+1; }
  // 再按「关卡接口的 studyVideoStatus」算一遍待播数，验面板改用这个来源之后数字对不对
  const bs=await fetch('/gateway/system/orgStudent/listCourseBarrier?courseId='+c.id+'&majorId='+me.majorId+'&userId='+me.id+'&version='+c.version+'&studentCourseId='+sid,{headers:{Authorization:t}}).then(r=>r.json());
  const status={};
  for(const b of (bs.data||[])){
    const ns=await fetch('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId='+sid,{headers:{Authorization:t}}).then(r=>r.json());
    for(const n of (ns.data||[])) if(n.videoId) status[n.videoId]=n.studyVideoStatus;
  }
  const known=vids.filter(v=>status[v.id]!==undefined).length;
  const todo=vids.filter(v=>status[v.id]!==2).length;
  return JSON.stringify({course:c.name,n:vids.length,tally,keys:Object.keys(vids[0]||{}).join(','),barriers:(bs.data||[]).length,known,todo})
})()`;
const ts = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('study.cqie'));
const ws = new WebSocket(ts[0].webSocketDebuggerUrl);
await new Promise((r) => { ws.onopen = r; });
const r = await new Promise((res) => {
  ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id === 1) res(x); };
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: EXPR, returnByValue: true, awaitPromise: true } }));
});
const v = (r.result && r.result.result && r.result.result.value) || (r.result && r.result.value);
if (!v) { console.log('异常：', JSON.stringify(r.exceptionDetails || r).slice(0, 300)); }
else { const o = JSON.parse(v); console.log(`课程「${o.course}」progressDetails 里 ${o.n} 条视频`); console.log('视频对象字段:', o.keys); for (const [k, n] of Object.entries(o.tally || {})) console.log(`  ${n} 条 → ${k}`);
console.log(`关卡 ${(o.barriers)} 个；树里 ${o.n} 条视频里，关卡接口覆盖到 ${o.known} 条；按 studyVideoStatus!==2 算待播 ${o.todo} 条`); }
ws.close(); process.exit(0);
