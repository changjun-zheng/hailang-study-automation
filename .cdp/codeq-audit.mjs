// 只读：查清「带 recordId 重写」之后，服务端为这道编程题留了几条记录，以及 exercisesList 独立重读稳不稳定。
//   node .cdp/codeq-audit.mjs [qid前缀]
// 主查询自带 err 分支：被 Chrome 挂起的标签页里 fetch 会静默失败拿到空课程列表，逐个标签页试到能拉到为止。
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const QID = process.argv[2] || '60ae1e9d';

const EXPR = `(async()=>{
  const t=localStorage.getItem('token2');
  if(!t) return JSON.stringify({err:'no-token'})
  const H={Authorization:t,'Content-Type':'application/json'};
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const P=(x,b)=>fetch(x[0]==='/'?x:'/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(e=>({code:-1,msg:String(e)}));
  const G=(x)=>fetch(x,{headers:H}).then(r=>r.json()).catch(e=>({code:-1,msg:String(e)}));
  const cs=await P('/gateway/frequent/orgStudent/pagedMyCourse',{filters:{courseNature:null,name:'',schoolYear:'',studentId:String(me.id),term:'',courseFlag:0},pageIndex:1,pageSize:50});
  const cl=(cs.data&&(cs.data.records||cs.data.list))||[];
  const c=cl.find(x=>(x.name||'').includes('前端框架'));
  if(!c) return JSON.stringify({err:'no-course',listCode:cs.code,n:cl.length,raw:String(JSON.stringify(cs)).slice(0,160),msg:String(cs.msg||'').slice(0,40)})
  const sid=c.studentCourseId||c.id;
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId='+c.id+'&majorId='+me.majorId+'&userId='+me.id+'&version='+c.version+'&studentCourseId='+sid);
  const units=[];
  for(const b of (bs.data||[])){const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId='+sid);
    for(const n of ns.data||[]) if(n.videoId&&!units.some(x=>x.unitId===n.id)) units.push({unitId:n.id,name:n.catalogName});}
  const res={sid:String(sid).slice(0,10),units:units.length,paged:[],list:null};
  const bodies=[
    {studentCourseId:sid,studentId:String(me.id),pageIndex:1,pageSize:50},
    {pageIndex:1,pageSize:50,filters:{studentCourseId:sid,studentId:String(me.id)}},
  ];
  for(const b of bodies){
    const r=await P('studyRecordExercises/paged',b);
    const recs=(r.data&&Array.isArray(r.data.records))?r.data.records:[];
    res.paged.push({body:Object.keys(b).join('+'),code:r.code,msg:String(r.msg||'').slice(0,40),total:r.data&&r.data.total,n:recs.length,
      keys:recs.length?Object.keys(recs[0]).join(','):(r.data?String(JSON.stringify(r.data)).slice(0,60):null),
      mine:recs.filter(x=>String(x.exercisesId||x.id||'').startsWith(${JSON.stringify(QID)})).map(x=>({rec:String(x.id||'').slice(0,12),file:String(x.submitFile||'').slice(0,12),ansLen:String(x.submitAnswer||'').length,st:x.submitTime,ct:x.createTime}))});
  }
  for(const s of units){
    await P('studyRecordExercises/exerciseBarrier',{studentCourseId:sid,unitId:s.unitId});
    const l=await P('studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:c.id,majorId:me.majorId,unitId:s.unitId,version:c.version});
    const q=(Array.isArray(l.data)?l.data:[]).find(x=>String(x.id).startsWith(${JSON.stringify(QID)}));
    if(q) res.list={unit:s.name,recordId:String(q.recordId||'').slice(0,12),file:String(q.submitFile||'').slice(0,14),ansLen:String(q.submitAnswer||'').length,st:q.submitTime,exStatus:q.studyExerciseStatus};
    await P('studyRecordExercises/clearStudentUnit',{studentCourseId:sid,unitId:s.unitId});
  }
  return JSON.stringify(res)
})()`;

const ts = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('study.cqie.edu.cn'));
const race = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
let out = null;
for (const t of ts) {
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  if (!(await race(new Promise((r) => { ws.onopen = () => r(true); ws.onerror = () => r(false); }), 4000))) { console.log(`  跳过连不上的标签页 ${t.url.slice(0, 56)}`); continue; }
  const r = await race(new Promise((res) => {
    ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id === 1) res(x.result); };
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: EXPR, returnByValue: true, awaitPromise: true } }));
  }), 40000);
  ws.close();
  if (!r) { console.log(`  标签页无响应 ${t.url.slice(0, 56)}`); continue; }
  const val = (r.result && r.result.value) !== undefined ? r.result.value : r.value;
  let v = null; try { v = JSON.parse(val); } catch { console.log(`  返回非 JSON：${String(val ?? r.exceptionDetails?.exception?.description ?? r.exceptionDetails?.text ?? JSON.stringify(r)).slice(0, 200)}`); continue; }
  if (v.err) { console.log(`  该标签页拉不到课程（${JSON.stringify(v)}），换下一个`); continue; }
  out = v; break;
}
if (!out) { console.error('所有标签页都拉不到课程列表'); process.exit(1); }

console.log(`独立重读 exercisesList：${JSON.stringify(out.list)}`);
for (const p of out.paged) {
  console.log(`\npaged(过滤=${p.body}) code=${p.code} ${p.msg} total=${p.total} 返回 ${p.n} 条`);
  if (p.keys) console.log(`  记录字段：${p.keys}`);
  console.log(`  属于本题的：${p.mine.length ? JSON.stringify(p.mine) : '（无）'}`);
}
process.exit(0);
