// 把某个设计题槽位的**完整题干**摊出来（只读，不 exerciseBarrier、不 clearStudentUnit、不提交），
// 免得我凭单元名猜题目要什么。输出所有字段名 + 每个长文本字段的内容。
//   node .cdp/design-stem.mjs 3134047458ad
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9226';
const QID = process.argv[2] || '';
const COURSE = process.argv[3] || '软件系统分析与设计';
const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('study.cqie.edu.cn'));
if (!tabs.length) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200); return r.result?.value; };
const out = await evl(`(async()=>{
  const H={Authorization:localStorage.getItem('token2'),'Content-Type':'application/json'};
  const P=(x,b)=>fetch(x[0]==='/'?x:'/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json());
  const G=(x)=>fetch(x,{headers:H}).then(r=>r.json());
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const cs=await P('/gateway/frequent/orgStudent/pagedMyCourse',{filters:{courseNature:null,name:'',schoolYear:'',studentId:String(me.id),term:'',courseFlag:0},pageIndex:1,pageSize:50});
  const cl=(cs.data&&(cs.data.records||cs.data.list))||[];
  const c=cl.find(x=>(x.name||'').includes(${JSON.stringify(COURSE)}));
  if(!c)return JSON.stringify({err:'没这门课，可选：'+cl.map(x=>x.name).join(' / ')});
  const sid=c.studentCourseId||c.id,ver=c.version||'BK_RJGC_2024';
  const units=[];
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId='+c.id+'&majorId='+me.majorId+'&userId='+me.id+'&version='+ver+'&studentCourseId='+sid);
  for(const b of (bs.data||[])){const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId='+sid);
    for(const n of ns.data||[]) if(n.videoId&&!units.some(x=>x.unitId===n.id)) units.push({unitId:n.id,name:n.catalogName});}
  const hits=[];let total=0,type8=0;
  for(const s of units){
    // exercisesList 依赖先开单元会话（exerciseBarrier），不开会返回空 —— 别把"没开"读成"没题"
    await P('studyRecordExercises/exerciseBarrier',{studentCourseId:sid,unitId:s.unitId});
    const l=await P('studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:c.id,majorId:me.majorId,unitId:s.unitId,version:ver});
    const arr=Array.isArray(l.data)?l.data:[];
    total+=arr.length; type8+=arr.filter(q=>q.questionType===8).length;
    // TYPES=5,8 只看这些题型；ONLYEMPTY=1 只看还没作答的槽位（都要在 node 侧插值，页面里没有 process）
    const want=${JSON.stringify((process.env.TYPES || '').split(',').filter((x) => x).map(Number))};
    const onlyEmpty=${JSON.stringify(!!process.env.ONLYEMPTY)};
    for(const q of arr) if((!want.length||want.includes(q.questionType))
      &&!(onlyEmpty&&String(q.submitAnswer||'').trim().length>4)
      &&(!${JSON.stringify(QID)}||String(q.id).startsWith(${JSON.stringify(QID)})))
      hits.push({单元:s.name,q:q});
    await P('studyRecordExercises/clearStudentUnit',{studentCourseId:sid,unitId:s.unitId});
  }
  return JSON.stringify({stu:me.studyNumber||me.id,课:c.name,单元数:units.length,题目总数:total,设计题数:type8,hits})})()`);
const o = JSON.parse(out);
if (o.err) { console.error(o.err); process.exit(1); }
console.log(`账号 ${o.stu}【${o.课}】枚举到 ${o.单元数} 个单元、${o.题目总数} 道题（其中设计题 ${o.设计题数} 道），命中 ${o.hits.length} 道`);
for (const h of o.hits) {
  console.log(`\n=== 单元「${h.单元}」 qid=${h.q.id} 类型=${h.q.questionType} 分值=${h.q.questionScore} ===`);
  // 落没落库要读只有服务端能填的字段：submitTime、studyExerciseStatus，以及答案长度
  console.log(`[服务端状态] studyExerciseStatus=${h.q.studyExerciseStatus} submitTime=${h.q.submitTime || '(空)'} submitAnswer=${String(h.q.submitAnswer || '').length} 字 submitFile=${h.q.submitFile ? String(h.q.submitFile).slice(0, 20) + '…' : '(空)'} recordId=${h.q.recordId || '(空)'}`);
  console.log('字段：' + Object.keys(h.q).join(', '));
  for (const [k, v] of Object.entries(h.q)) {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    if (s && s.length > 24 && k !== 'options' && k !== 'optionList') console.log(`\n[${k}]\n${s.slice(0, 2600)}`);
  }
  const opts = h.q.options || h.q.optionList || h.q.questionOptionVos;
  if (opts) console.log('\n[选项]\n' + JSON.stringify(opts).slice(0, 1200));
}
ws.close(); process.exit(0);
