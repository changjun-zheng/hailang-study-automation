// 实验：这两道编程题在 2026-10-11 21:02 被我自己的早期探针写出了一条「submitAnswer=[]、无附件」的记录，
// 之后 createExercisesList 写入回 200 但 submitFile 始终不落 —— 怀疑服务端按 (学生,单元,题目) 命中旧记录后不再更新。
// 这里逐个试「把旧 recordId 带上」的几种写法，每试一次就重新读服务端字段裁决，第一个成功的就停。
//   node .cdp/codeq-fix.mjs                 两道都试
//   node .cdp/codeq-fix.mjs --only 构建Vue   只试某个单元
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const ONLY = arg('--only', '');

import fs from 'node:fs';
import path from 'node:path';
const ROOT = import.meta.dirname;
const CACHE = JSON.parse(fs.readFileSync(path.join(ROOT, 'codeq', 'upload-cache.json'), 'utf8'));
const fileOf = {};
for (const v of Object.values(CACHE)) if (v.qid) fileOf[v.qid] = v.id;

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
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('页面执行出错：' + String(r.exceptionDetails.exception?.description || '').slice(0, 240)); process.exit(1); } return r.result?.value; };

const ctx = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const P=(x,b)=>fetch(x[0]==='/'?x:'/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(e=>({code:-1}));
  const G=(x)=>fetch(x,{headers:H}).then(r=>r.json()).catch(e=>({code:-1}));
  const cs=await P('/gateway/frequent/orgStudent/pagedMyCourse',{filters:{courseNature:null,name:'',schoolYear:'',studentId:String(me.id),term:'',courseFlag:0},pageIndex:1,pageSize:50});
  const c=((cs.data&&(cs.data.records||cs.data.list))||[]).find(x=>(x.name||'').includes('前端框架'));
  const sid=c.studentCourseId||c.id;
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId='+c.id+'&majorId='+me.majorId+'&userId='+me.id+'&version='+c.version+'&studentCourseId='+sid);
  const units=[];
  for(const b of (bs.data||[])){const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId='+sid);
    for(const n of ns.data||[]) if(n.videoId&&!units.some(x=>x.unitId===n.id)) units.push({unitId:n.id,name:n.catalogName});}
  const rows=[];
  for(const s of units){
    await P('studyRecordExercises/exerciseBarrier',{studentCourseId:sid,unitId:s.unitId});
    const l=await P('studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:c.id,majorId:me.majorId,unitId:s.unitId,version:c.version});
    for(const q of (Array.isArray(l.data)?l.data:[])) if(q.questionType===7&&!q.submitFile&&q.recordId) rows.push({unit:s.name,unitId:s.unitId,qid:q.id,recordId:q.recordId});
    await P('studyRecordExercises/clearStudentUnit',{studentCourseId:sid,unitId:s.unitId});
  }
  return JSON.stringify({sid,cid:c.id,ver:c.version,rows})
})()`));
const targets = ctx.rows.filter((r) => !ONLY || r.unit.includes(ONLY));
console.log(`待修 ${targets.length} 道（有旧 recordId 且 submitFile 为空）：${targets.map((t) => t.unit).join(' / ')}`);

for (const t of targets) {
  const fid = fileOf[t.qid];
  if (!fid) { console.log(`  ✗ ${t.unit}：上传缓存里没有它的 fileId，先跑 answer-codeq.mjs 上传`); continue; }
  console.log(`\n→ ${t.unit}  recordId=${String(t.recordId).slice(0, 12)} fileId=${String(fid).slice(0, 12)}`);
  const variants = [
    { name: '带 recordId + updateCount=0', extra: { recordId: t.recordId, updateCount: 0 } },
    { name: '带 recordId + updateCount=1', extra: { recordId: t.recordId, updateCount: 1 } },
    { name: '带 recordId + exercisesConfigId', extra: { recordId: t.recordId, updateCount: 0, exercisesConfigId: t.cfg || null } },
  ];
  let done = false;
  for (const v of variants) {
    const r = JSON.parse(await evl(`(async()=>{
      const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
      const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
      const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(e=>({code:-1,msg:String(e)}));
      const sid='${ctx.sid}',uid='${t.unitId}',cid='${ctx.cid}',ver='${ctx.ver}',qid='${t.qid}';
      await P('studyRecordExercises/exerciseBarrier',{studentCourseId:sid,unitId:uid});
      await P('studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:cid,majorId:me.majorId,unitId:uid,version:ver});
      const ck=await P('courseCatalogExercisesConfig/checkUpdateExercises',{studentCourseId:sid,courseId:cid,majorId:me.majorId,unitId:uid,version:ver});
      const oid=(ck.data&&(ck.data.operationId||ck.data.id))||'';
      const item=Object.assign({exercisesId:qid,questionType:7,submitAnswer:'[]',submitFile:'${fid}',referenceAnswer:'',recordId:null,updateCount:0},${JSON.stringify(v.extra)});
      const body={poList:[item],operationId:oid,studentCourseId:sid,unitId:uid,courseId:cid};
      const w=await P('studyRecordExercises/createExercisesList',body);
      await P('studyRecordExercises/exerciseBarrier',{studentCourseId:sid,unitId:uid});
      const l1=await P('studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:cid,majorId:me.majorId,unitId:uid,version:ver});
      const q1=(Array.isArray(l1.data)?l1.data:[]).find(x=>String(x.id)===qid);
      const rb={found:!!q1,file:q1?String(q1.submitFile||''):'',same:!!(q1&&String(q1.submitFile||'')==='${fid}'),rec:q1?String(q1.recordId||'').slice(0,12):'',st:q1?q1.submitTime:null};
      await P('studyRecordExercises/clearStudentUnit',{studentCourseId:sid,unitId:uid});
      return JSON.stringify({oid:String(oid).slice(0,8),wcode:w.code,wmsg:String(w.msg||'').replace(/\\s+/g,' ').slice(0,160),rb})
    })()`));
    console.log(`  ${v.name.padEnd(34)} 写入 code=${r.wcode} ${r.wmsg} | 回读 submitFile=${r.rb.same ? '已落库' : (r.rb.file ? '仍为:' + r.rb.file.slice(0, 14) : '仍为空')} recordId=${r.rb.rec} submitTime=${r.rb.st}`);
    if (r.rb.same) { console.log(`  ✓ ${t.unit} 用「${v.name}」这一种写法成功了`); done = true; break; }
  }
  if (!done) console.log(`  ✗ ${t.unit}：三种写法都没让 submitFile 落库`);
}
ws.close(); process.exit(0);
