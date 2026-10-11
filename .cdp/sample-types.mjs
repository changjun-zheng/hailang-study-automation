// 每种题型各抽一道，看 referenceAnswer 与 optionVos 的真实结构，用来定"双证"判据该怎么写
//   node .cdp/sample-types.mjs
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const evl = async (expr) => { const r = await new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } })); }); if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || '').slice(0, 200); return r.result?.value; };

const PAGE = `(async()=>{
  const tok=localStorage.getItem('token2');const H={Authorization:tok,'Content-Type':'application/json'};
  const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(()=>({}));
  const G=(x)=>fetch(x,{headers:H}).then(r=>r.json()).catch(()=>({}));
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId=${CID}&majorId=${MID}&userId='+me.id+'&version=BK_RJGC_2024&studentCourseId=${SC}');
  const units=[];
  for(const b of bs.data||[]){const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId=${SC}');
    for(const n of ns.data||[]) if(n.videoId&&!units.some(x=>x.unitId===n.id)) units.push({unitId:n.id,name:n.catalogName})}
  const seen={};const lines=[];
  for(const s of units){
    await P('studyRecordExercises/exerciseBarrier',{studentCourseId:'${SC}',unitId:s.unitId});
    const l=await P('studyRecordExercises/exercisesList',{studentCourseId:'${SC}',courseId:'${CID}',majorId:'${MID}',unitId:s.unitId,version:'BK_RJGC_2024'});
    for(const q of (l.data||[])){
      const k='type'+q.questionType;
      if(!seen[k]){seen[k]=1;
        const opts=(q.optionVos||[]).map(o=>({id:String(o.id).slice(0,12),flag:o.answerFlag,name:String(o.optionName||o.name||'').slice(0,16)}));
        lines.push('题型='+q.questionType+'  单元='+s.name);
        lines.push('   referenceAnswer='+JSON.stringify(q.referenceAnswer).slice(0,200));
        lines.push('   optionVos='+JSON.stringify(opts).slice(0,460));
        lines.push('   submitAnswer='+JSON.stringify(q.submitAnswer).slice(0,80)+'  studyExerciseStatus='+q.studyExerciseStatus);
      }
    }
    await P('studyRecordExercises/clearStudentUnit',{studentCourseId:'${SC}',unitId:s.unitId});
    if(Object.keys(seen).length>=6) break;
  }
  return lines.join(String.fromCharCode(10))
})()`;
console.log(String(await evl(PAGE)).slice(0, 4000));
ws.close(); process.exit(0);
