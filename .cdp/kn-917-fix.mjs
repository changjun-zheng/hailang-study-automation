// 917「题目已更新，请重新做题」实验：知识练习层那道题的服务端行里 updateCount=2、updateFlag=1，
// 而我提交时 poList[].updateCount 一直硬编码 0 —— 怀疑服务端拿它当题目版本戳，对不上就拒。
// 逐个变体试提交，每试一次立刻按写入时同样的调用序列（check -> exercisesList）回读，以服务端为准。
//   node .cdp/kn-917-fix.mjs            只试第一个变体
//   node .cdp/kn-917-fix.mjs --all      把变体挨个试到成功为止
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const TRY_ALL = process.argv.includes('--all');

const FIND = `(async()=>{
  const t=localStorage.getItem('token2');if(!t) return JSON.stringify({err:'no-token'})
  const H={Authorization:t,'Content-Type':'application/json'};
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const P=(x,b)=>fetch(x[0]==='/'?x:'/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(e=>({code:-1,msg:String(e)}));
  const cs=await P('/gateway/frequent/orgStudent/pagedMyCourse',{filters:{courseNature:null,name:'',schoolYear:'',studentId:String(me.id),term:'',courseFlag:0},pageIndex:1,pageSize:50});
  const c=((cs.data&&(cs.data.records||cs.data.list))||[]).find(x=>String(x.name||'').includes('软件系统分析与设计'));
  if(!c) return JSON.stringify({err:'no-course'})
  const sid=c.studentCourseId||c.id, ver=c.version||'BK_RJGC_2024';
  const pd=await fetch('/gateway/system/orgStudent/progressDetails?studentId='+(me.studyNumber||me.id)+'&id='+c.id+'&majorId='+me.majorId+'&studentCourseId='+sid+'&version='+ver,{headers:{Authorization:t}}).then(r=>r.json()).catch(e=>({code:-1,msg:String(e)}));
  const segs=[];
  const walk=(n,parent)=>{ if(!n||typeof n!=='object')return;
    for(const [k,v] of Object.entries(n)){
      if(Array.isArray(v)&&/KnowledgeTimeRanges/.test(k)&&!/Vos$/.test(k))
        for(const s of v) if(s&&s.id) segs.push({segId:s.id,unitId:(parent&&parent.unitId)||'',videoId:(parent&&(parent.videoId||parent.id))||''});
      if(Array.isArray(v)) for(const it of v) if(it&&typeof it==='object') walk(it,it);
      else if(v&&typeof v==='object') walk(v,parent);
    }
  };
  walk({children:Array.isArray(pd.data)?pd.data:[]},null);
  const uniq=[...new Map(segs.map(s=>[s.segId,s])).values()].filter(s=>s.unitId&&s.videoId);
  const norm=(v)=>String(v||'').split(/[|,]/).map(s=>s.trim()).filter(Boolean).sort().join(',');
  for(const s of uniq){
    await P('studyKnowledgeExerciseRecord/check',{segmentKnowledgeId:s.segId,studentCourseId:sid,studentId:me.studyNumber||me.id,videoId:s.videoId});
    const l=await P('studyKnowledgeExerciseRecord/exercisesList',{knowledgeNodeId:s.segId,studentCourseId:sid,unitId:s.unitId});
    for(const q of (Array.isArray(l.data)?l.data:[])){
      if(q.submitAnswer) continue;
      const right=(q.optionVos||[]).filter(o=>o.answerFlag===1).map(o=>o.id);
      const ok=q.questionType===1?(right.length===1&&norm(right)===norm(q.referenceAnswer)):q.questionType===2?(right.length>1&&norm(right)===norm(q.referenceAnswer)):/^[01]$/.test(String(q.referenceAnswer==null?'':q.referenceAnswer).trim());
      if(ok) return JSON.stringify({sid,ver,cid:c.id,me:me.id,major:me.majorId,seg:s,q})
    }
  }
  return JSON.stringify({err:'not-found',segTotal:uniq.length,pdCode:pd.code,pdMsg:String(pd.msg||'').slice(0,60)})
})()`;

const ts = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('study.cqie.edu.cn'));
const race = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
const call = async (expr, ms) => {
  for (const t of ts) {
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    if (!(await race(new Promise((r) => { ws.onopen = () => r(true); ws.onerror = () => r(false); }), 4000))) { continue; }
    const r = await race(new Promise((res) => {
      ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id === 1) res(x.result); };
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
    }), ms);
    ws.close();
    if (!r || !r.result || r.result.value === undefined) continue;
    try { return JSON.parse(r.result.value); } catch { continue; }
  }
  return null;
};

const hit = await call(FIND, 300000);
if (!hit || hit.err) { console.error('没找到那道题：' + JSON.stringify(hit)); process.exit(1); }
console.log(`题目 qid=${String(hit.q.id).slice(0, 12)} 题型=${hit.q.questionType} 服务端给的版本戳 updateCount=${hit.q.updateCount} updateFlag=${hit.q.updateFlag} status=${hit.q.status} recordId=${hit.q.recordId || 'null'}`);
console.log(`分段 segId=${String(hit.seg.segId).slice(0, 12)} knowledgeNodeId=${hit.q.knowledgeNodeId} 选项数=${(hit.q.optionVos || []).length}`);

const variants = [
  { name: 'updateCount 用服务端的值', item: { updateCount: hit.q.updateCount }, outer: {} },
  { name: 'updateCount 服务端值 + item 带 updateFlag', item: { updateCount: hit.q.updateCount, updateFlag: hit.q.updateFlag }, outer: {} },
  { name: 'updateCount 服务端值 + item 带 knowledgeNodeId', item: { updateCount: hit.q.updateCount, knowledgeNodeId: hit.q.knowledgeNodeId }, outer: {} },
  { name: '外层再补 version/updateCount', item: { updateCount: hit.q.updateCount }, outer: { updateCount: hit.q.updateCount, questionVersion: hit.q.updateCount } },
];

for (const [i, v] of variants.entries()) {
  const expr = `(async()=>{
    const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
    const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(e=>({code:-1,msg:String(e)}));
    const sid='${hit.sid}',segId='${hit.seg.segId}',unitId='${hit.seg.unitId}',videoId='${hit.seg.videoId}',qid='${hit.q.id}';
    await P('studyKnowledgeExerciseRecord/check',{segmentKnowledgeId:segId,studentCourseId:sid,studentId:'${hit.me}',videoId:videoId});
    const item=Object.assign({submitAnswer:${JSON.stringify(hit.q.referenceAnswer)},exercisesId:qid,questionType:${hit.q.questionType},referenceAnswer:${JSON.stringify(hit.q.referenceAnswer)},recordId:null,updateCount:0},${JSON.stringify(v.item)});
    const body=Object.assign({segmentKnowledgeId:segId,poList:[item],studentCourseId:sid,studentId:'${hit.me}',courseId:'${hit.cid}',videoId:videoId,unitId:unitId,majorId:'${hit.major}',version:'${hit.ver}'},${JSON.stringify(v.outer)});
    const w=await P('studyKnowledgeExerciseSummaryRecord/createList',body);
    // 回读要重放写入时同样的序列：check -> exercisesList
    await P('studyKnowledgeExerciseRecord/check',{segmentKnowledgeId:segId,studentCourseId:sid,studentId:'${hit.me}',videoId:videoId});
    const l2=await P('studyKnowledgeExerciseRecord/exercisesList',{knowledgeNodeId:segId,studentCourseId:sid,unitId:unitId});
    const q2=(Array.isArray(l2.data)?l2.data:[]).find(x=>String(x.id)===qid);
    return JSON.stringify({code:w.code,msg:String(w.msg||'').replace(/\\s+/g,' ').slice(0,120),
      rb:q2?{answered:!!q2.submitAnswer,uc:q2.updateCount,uf:q2.updateFlag,st:q2.submitTime,rec:q2.recordId?String(q2.recordId).slice(0,10):null}:'没读到题'})
  })()`;
  const r = await call(expr, 120000);
  console.log(`\n[${i + 1}] ${v.name}`);
  console.log(`    提交 code=${r && r.code} ${r && r.msg} | 回读 ${JSON.stringify(r && r.rb)}`);
  if (r && r.rb && r.rb.answered) { console.log(`    ✓ 用「${v.name}」成功了`); break; }
  if (!TRY_ALL && i === 0) { console.log('    （只试了第一个变体；加 --all 挨个试）'); break; }
}
process.exit(0);
