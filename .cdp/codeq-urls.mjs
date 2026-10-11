// 只读：把编程题对象里所有"文件类"字段的原始值打出来，用来反推 file 服务的真实 URL 形状
//   node .cdp/codeq-urls.mjs
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
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
  const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(()=>({}));
  const G=(x)=>fetch(x,{headers:H}).then(r=>r.json()).catch(()=>({}));
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId=${CID}&majorId=${MID}&userId='+me.id+'&version=BK_RJGC_2024&studentCourseId=${SC}');
  const units=[];
  for(const b of bs.data||[]){const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId=${SC}');
    for(const n of ns.data||[]) if(n.videoId&&!units.some(x=>x.unitId===n.id)) units.push({unitId:n.id,name:n.catalogName})}
  const rows=[];
  for(const s of units){
    await P('studyRecordExercises/exerciseBarrier',{studentCourseId:'${SC}',unitId:s.unitId});
    const l=await P('studyRecordExercises/exercisesList',{studentCourseId:'${SC}',courseId:'${CID}',majorId:'${MID}',unitId:s.unitId,version:'BK_RJGC_2024'});
    for(const q of (l.data||[])) if(q.questionType===7) rows.push({unit:s.name,qid:q.id,
      baseFileUrl:q.baseFileUrl,baseFileName:q.baseFileName,referenceAnswerUrl:q.referenceAnswerUrl,referenceAnswerName:q.referenceAnswerName,
      sourceMaterialUrl:q.sourceMaterialUrl,sourceMaterialName:q.sourceMaterialName,runFile:q.runFile,submitFile:q.submitFile,
      gitFiles:JSON.stringify(q.gitFiles||[]).slice(0,200),files:JSON.stringify(q.studyRecordExercisesFileVos||[]).slice(0,300),
      officeType:q.officeType,language:q.languageName,score:q.questionScore});
    await P('studyRecordExercises/clearStudentUnit',{studentCourseId:'${SC}',unitId:s.unitId});
  }
  return JSON.stringify(rows)
})()`;
const rows = JSON.parse(await evl(PAGE));
console.log(`${rows.length} 道编程题的文件类字段：`);
for (const r of rows) {
  console.log(`\n— ${r.unit} (${r.language}, ${r.score}分)`);
  for (const k of ['baseFileUrl', 'baseFileName', 'referenceAnswerUrl', 'referenceAnswerName', 'sourceMaterialUrl', 'sourceMaterialName', 'runFile', 'submitFile', 'officeType']) {
    const v = r[k];
    if (v === null || v === undefined || v === '' || v === 0) continue;
    console.log(`    ${k} = ${String(v).slice(0, 170)}`);
  }
  if (r.gitFiles && r.gitFiles !== '[]') console.log(`    gitFiles = ${r.gitFiles}`);
  if (r.files && r.files !== '[]') console.log(`    studyRecordExercisesFileVos = ${r.files}`);
}
ws.close(); process.exit(0);
