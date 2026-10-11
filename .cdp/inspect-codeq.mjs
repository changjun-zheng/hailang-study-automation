// 只读：把一道编程题的完整对象打出来，看平台是否直接给了参考答案文件、以及提交需要什么字段
//   node .cdp/inspect-codeq.mjs [第几道编程题，从 0 开始]
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const NTH = Number(process.argv[2] || 0);
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
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || '').slice(0, 200); return r.result?.value; };

const PAGE = `(async()=>{
  const tok=localStorage.getItem('token2');const H={Authorization:tok,'Content-Type':'application/json'};
  const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(()=>({}));
  const G=(x)=>fetch(x,{headers:H}).then(r=>r.json()).catch(()=>({}));
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId=${CID}&majorId=${MID}&userId='+me.id+'&version=BK_RJGC_2024&studentCourseId=${SC}');
  const units=[];
  for(const b of bs.data||[]){const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId=${SC}');
    for(const n of ns.data||[]) if(n.videoId&&!units.some(x=>x.unitId===n.id)) units.push({unitId:n.id,name:n.catalogName,videoId:n.videoId})}
  const codeq=[];
  for(const s of units){
    await P('studyRecordExercises/exerciseBarrier',{studentCourseId:'${SC}',unitId:s.unitId});
    const l=await P('studyRecordExercises/exercisesList',{studentCourseId:'${SC}',courseId:'${CID}',majorId:'${MID}',unitId:s.unitId,version:'BK_RJGC_2024'});
    for(const q of (l.data||[])) if(q.questionType===7) codeq.push({unit:s, q});
    await P('studyRecordExercises/clearStudentUnit',{studentCourseId:'${SC}',unitId:s.unitId});
  }
  const pick=codeq[${NTH}];
  return JSON.stringify({count:codeq.length, pick:pick||null, allBrief:codeq.map(x=>({unit:x.unit.name, qid:x.q.id, lang:x.q.languageName, base:x.q.baseFileName, refName:x.q.referenceAnswerName, refUrl:String(x.q.referenceAnswerUrl||'').slice(0,90), srcName:x.q.sourceMaterialName, git:(x.q.gitFiles||[]).length, submit:x.q.submitAnswer?String(x.q.submitAnswer).slice(0,30):null, file:x.q.submitFile?String(x.q.submitFile).slice(0,60):null}))})
})()`;
const o = JSON.parse(await evl(PAGE));
console.log(`编程题共 ${o.count} 道：`);
for (const b of o.allBrief) console.log(`  ${String(b.unit).slice(0, 22).padEnd(24)} lang=${b.lang} 基础文件=${b.base} 参考答案文件=${b.refName} gitFiles=${b.git} 已答=${b.submit || '无'} 已传=${b.file || '无'}`);
if (o.pick) {
  console.log(`\n=== 第 ${NTH} 道完整对象 ===`);
  console.log(JSON.stringify(o.pick, null, 1).slice(0, 3000));
}
ws.close(); process.exit(0);
