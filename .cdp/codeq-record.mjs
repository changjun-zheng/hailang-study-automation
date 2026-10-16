// 只读：把「构建Vue的应用实例-1」（写入 200 但 submitFile 不生效）和一道成功题的记录分别读出来对比。
// 逐个试没探过的读接口，只打印 code / msg / 顶层字段名，不打答案正文。
//   node .cdp/codeq-record.mjs
import path from 'node:path';

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

const shape = (v, depth = 0) => {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return `[${v.length}]` + (v.length && depth < 2 ? shape(v[0], depth + 1) : '');
  if (typeof v === 'object') return depth < 2 ? '{' + Object.keys(v).join(',') + '}' : '{…}';
  return typeof v + ':' + String(v).slice(0, 24);
};

// 先拿两道题的 recordId / unitId / courseId
const ctx = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const P=(x,b)=>fetch(x[0]==='/'?x:'/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(e=>({code:-1,msg:String(e)}));
  const G=(x)=>fetch(x,{headers:H}).then(r=>r.json()).catch(e=>({code:-1,msg:String(e)}));
  const cs=await P('/gateway/frequent/orgStudent/pagedMyCourse',{filters:{courseNature:null,name:'',schoolYear:'',studentId:String(me.id),term:'',courseFlag:0},pageIndex:1,pageSize:50});
  const c=((cs.data&&(cs.data.records||cs.data.list))||[]).find(x=>(x.name||'').includes('前端框架'));
  const sid=c.studentCourseId||c.id;
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId='+c.id+'&majorId='+me.majorId+'&userId='+me.id+'&version='+c.version+'&studentCourseId='+sid);
  const units=[];
  for(const b of (bs.data||[])){const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId='+sid);
    for(const n of ns.data||[]) if(n.videoId&&!units.some(x=>x.unitId===n.id)) units.push({unitId:n.id,name:n.catalogName});}
  const hit=[];
  for(const s of units){
    await P('studyRecordExercises/exerciseBarrier',{studentCourseId:sid,unitId:s.unitId});
    const l=await P('studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:c.id,majorId:me.majorId,unitId:s.unitId,version:c.version});
    for(const q of (Array.isArray(l.data)?l.data:[])) if(q.questionType===7)
      hit.push({unit:s.name,unitId:s.unitId,qid:q.id,recordId:q.recordId||null,file:q.submitFile||null,submitTime:q.submitTime||null,cfg:q.exercisesConfigId,score:q.questionScore,lang:q.language});
    await P('studyRecordExercises/clearStudentUnit',{studentCourseId:sid,unitId:s.unitId});
  }
  return JSON.stringify({sid,cid:c.id,ver:c.version,me:me.id,major:me.majorId,hit})
})()`));
// 只深挖两类：有旧记录但 submitFile 为空（写入 200 不生效的），和一道成功的做对照
const hit = [...ctx.hit.filter((h) => !h.file && h.recordId), ctx.hit.find((h) => h.file && h.recordId)].filter(Boolean);
console.log(`\n编程题共 ${ctx.hit.length} 道，本轮深挖 ${hit.length} 道：`);
for (const h of ctx.hit) console.log(`  ${h.file ? 'OK  ' : 'FAIL'} ${String(h.unit).padEnd(24)} qid=${String(h.qid).slice(0, 12)} recordId=${h.recordId ? String(h.recordId).slice(0, 12) : 'null'} submitTime=${h.submitTime}`);

for (const h of hit) {
  console.log(`\n===== ${h.unit}  qid=${String(h.qid).slice(0, 12)} recordId=${h.recordId ? String(h.recordId).slice(0, 12) : 'null'} file=${h.file ? '有' : '无'}`);
  const tries = [
    ['POST studyRecordExercises/detail {id:qid}', `P('studyRecordExercises/detail',{id:'${h.qid}'})`],
    ['POST studyRecordExercises/detail {recordId}', h.recordId ? `P('studyRecordExercises/detail',{recordId:'${h.recordId}'})` : 'null'],
    ['POST studyRecordExercises/info {id:qid}', `P('studyRecordExercises/info',{id:'${h.qid}'})`],
    ['POST studyRecordExercises/current {studentCourseId,unitId}', `P('studyRecordExercises/current',{studentCourseId:'${ctx.sid}',unitId:'${h.unitId}'})`],
    ['GET  studyRecordExercises/detail?id=', `G('/gateway/study/studyRecordExercises/detail?id=${h.qid}')`],
    ['GET  studyRecordExercisesFile/getCodeZip?recordId=', h.recordId ? `G('/gateway/study/studyRecordExercisesFile/getCodeZip?recordId=${h.recordId}')` : 'null'],
  ];
  for (const [label, js] of tries) {
    if (js === 'null') { console.log(`  ${label} -> 缺参数，跳过`); continue; }
    const raw = await evl(`(async()=>{
      const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
      const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.text()).catch(e=>JSON.stringify({code:-1,msg:String(e)}));
      const G=(x)=>fetch(x,{headers:H}).then(r=>r.text()).catch(e=>JSON.stringify({code:-1,msg:String(e)}));
      return (${js})
    })()`);
    let j = null; try { j = JSON.parse(raw); } catch { console.log(`  ${label} -> 非 JSON ${String(raw).slice(0, 160)}`); continue; }
    console.log(`  ${label} -> code=${j.code} msg=${String(j.msg || '').replace(/\s+/g, ' ').slice(0, 70)} data=${shape(j.data)}${j.code === undefined ? '  原文:' + String(raw).replace(/\s+/g, ' ').slice(0, 150) : ''}`);
  }
}
ws.close(); process.exit(0);
