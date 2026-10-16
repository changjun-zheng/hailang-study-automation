// 探接口存在性：只发空列表 / 空对象，服务端要么 404（不存在）、要么回校验错（存在且能告诉我缺哪个字段）。
// 空 poList 建不出记录，不会往账号里写垃圾。
//   node .cdp/codeq-endpoints.mjs
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ts = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('study.cqie.edu.cn'));
const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(false), ms))]);
let ws = null;
for (const t of ts) {
  const cand = new WebSocket(t.webSocketDebuggerUrl);
  if (!(await withTimeout(new Promise((r) => { cand.onopen = () => r(true); cand.onerror = () => r(false); }), 4000))) continue;
  ws = cand; break;
}
if (!ws) { console.error('所有 study 标签页都连不上'); process.exit(1); }
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 160); return r.result?.value; };

// 拿一门课的 sid/unitId 当上下文
const ctx = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const P=(x,b)=>fetch(x[0]==='/'?x:'/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(e=>({code:-1}));
  const G=(x)=>fetch(x,{headers:H}).then(r=>r.json()).catch(e=>({code:-1}));
  const cs=await P('/gateway/frequent/orgStudent/pagedMyCourse',{filters:{courseNature:null,name:'',schoolYear:'',studentId:String(me.id),term:'',courseFlag:0},pageIndex:1,pageSize:50});
  const c=((cs.data&&(cs.data.records||cs.data.list))||[]).find(x=>(x.name||'').includes('前端框架'));
  const sid=c.studentCourseId||c.id;
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId='+c.id+'&majorId='+me.majorId+'&userId='+me.id+'&version='+c.version+'&studentCourseId='+sid);
  let unit=null;
  for(const b of (bs.data||[])){const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId='+sid);
    const n=(ns.data||[]).find(x=>x.videoId&&(x.catalogName||'').includes('构建Vue的应用实例'));
    if(n){unit={unitId:n.id,name:n.catalogName};break;}}
  return JSON.stringify({sid,cid:c.id,ver:c.version,me:me.id,major:me.majorId,unit})
})()`));
console.log('上下文:', JSON.stringify(ctx));

const probes = [
  ['studyRecordExercises/save', 'POST', { poList: [] }],
  ['studyRecordExercises/submit', 'POST', { poList: [] }],
  ['studyRecordExercises/submitExercises', 'POST', { poList: [] }],
  ['studyRecordExercises/start', 'POST', {}],
  ['studyRecordExercises/current', 'POST', { studentCourseId: ctx.sid, unitId: ctx.unit && ctx.unit.unitId }],
  ['studyRecordExercises/paged', 'POST', { pageIndex: 1, pageSize: 1 }],
  ['studyRecordExercises/exercisesDetail', 'POST', {}],
  ['studyRecordExercises/updateExercisesList', 'POST', { poList: [] }],
  ['studyRecordExercises/update', 'POST', { poList: [] }],
  ['studyRecordExercises/modifyExercisesList', 'POST', { poList: [] }],
];

for (const [p, method, body] of probes) {
  const raw = await evl(`(async()=>{
    const t=localStorage.getItem('token2');
    const r=await fetch('/gateway/study/${p}',{method:'${method}',headers:{Authorization:t,'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(body)})});
    return (await r.text()).slice(0,260)
  })()`);
  let code = '?', msg = '';
  try { const j = JSON.parse(raw); code = j.code; msg = String(j.msg || '').replace(/\s+/g, ' ').slice(0, 110); } catch { msg = String(raw).replace(/\s+/g, ' ').slice(0, 110); }
  console.log(`  ${p.padEnd(46)} -> code=${String(code).padEnd(5)} ${msg}`);
}
ws.close(); process.exit(0);
