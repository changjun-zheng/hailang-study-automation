// 只读：按题型统计一门课的习题，并各抽一道样本，看 referenceAnswer / optionVos 长什么样
//   node .cdp/question-types.mjs [课程名]
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const COURSE = process.argv[2] || '软件系统分析与设计';
const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

const PAGE = `(async()=>{
  const tok=localStorage.getItem('token2');const H={Authorization:tok,'Content-Type':'application/json'};
  const P=(x,b)=>fetch(x[0]==='/'?x:'/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(()=>({}));
  const G=(x)=>fetch(x,{headers:H}).then(r=>r.json()).catch(()=>({}));
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const cs=await P('/gateway/frequent/orgStudent/pagedMyCourse',{filters:{courseNature:null,name:'',schoolYear:'',studentId:String(me.id),term:'',courseFlag:0},pageIndex:1,pageSize:50});
  const cl=(cs.data&&(cs.data.records||cs.data.list))||[];
  const c=cl.find(x=>(x.name||'')===${JSON.stringify(COURSE)})||cl.find(x=>(x.name||'').includes(${JSON.stringify(COURSE)}));
  if(!c) return JSON.stringify({err:'没这门课: '+cl.map(x=>x.name).join('/')});
  const sid=c.studentCourseId||c.id;
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId='+c.id+'&majorId='+me.majorId+'&userId='+me.id+'&version='+c.version+'&studentCourseId='+sid);
  const units=[];
  for(const b of bs.data||[]){const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId='+sid);
    for(const n of ns.data||[]) if(n.videoId&&!units.some(x=>x.unitId===n.id)) units.push({unitId:n.id,name:n.catalogName})}
  const byType={};
  for(const s of units){
    await P('studyRecordExercises/exerciseBarrier',{studentCourseId:sid,unitId:s.unitId});
    const l=await P('studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:c.id,majorId:me.majorId,unitId:s.unitId,version:c.version});
    for(const q of (l.data||[])){
      const k=q.questionType;
      byType[k]=byType[k]||{name:q.questionTypeName,n:0,samples:[]};
      byType[k].n++;
      if(byType[k].samples.length<2) byType[k].samples.push({
        unit:s.name, content:String(q.content||'').replace(/<[^>]+>/g,'').slice(0,60),
        ref:String(q.referenceAnswer==null?'null':q.referenceAnswer).slice(0,110),
        opts:(q.optionVos||[]).map(o=>({id:String(o.id).slice(0,8),flag:o.answerFlag})).slice(0,6),
        score:q.questionScore, submit:q.submitAnswer?String(q.submitAnswer).slice(0,40):null});
    }
    await P('studyRecordExercises/clearStudentUnit',{studentCourseId:sid,unitId:s.unitId});
  }
  return JSON.stringify({course:c.name,byType})
})()`;
const o = JSON.parse(await evl(PAGE));
if (o.err) { console.log(o.err); process.exit(0); }
console.log(`课程「${o.course}」按题型统计：`);
for (const [k, v] of Object.entries(o.byType).sort((a, b) => a[0] - b[0])) {
  console.log(`\n题型 ${k} =「${v.name}」共 ${v.n} 道`);
  for (const s of v.samples) {
    console.log(`   单元=${s.unit} 分值=${s.score} 已答=${s.submit || '无'}`);
    console.log(`   题干: ${s.content}`);
    console.log(`   referenceAnswer: ${s.ref}`);
    console.log(`   optionVos: ${JSON.stringify(s.opts)}`);
  }
}
ws.close(); process.exit(0);
