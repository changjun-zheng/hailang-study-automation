// 单元级「习题」链路（真人录制里全是 200）：exerciseBarrier → checkUpdateExercises → exercisesList
// 默认只读到题目为止，加 --apply 才提交答案
//   node .cdp/answer-unit.mjs <单元名关键字> [--apply]
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const KEY = process.argv[2] || '使用计算属性';
const APPLY = process.argv.includes('--apply');
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.log('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 240)); process.exit(1); } return r.result?.value; };

const out = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const u=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(e=>({err:String(e)}));
  const G=(x)=>fetch(x,{headers:H}).then(r=>r.json()).catch(e=>({err:String(e)}));
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId=${CID}&majorId=${MID}&userId='+u.id+'&version=BK_RJGC_2024&studentCourseId=${SC}');
  let unit=null,vid=null;
  for(const b of bs.data||[]){const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId=${SC}');
    for(const n of ns.data||[]) if((n.catalogName||'').includes(${JSON.stringify(KEY)})&&n.videoId&&!vid){unit=n;vid=n}}
  if(!unit) return JSON.stringify({err:'找不到单元'});
  const r1=await P('studyRecordExercises/exerciseBarrier',{studentCourseId:'${SC}',unitId:unit.id});
  const r2=await P('/study/courseCatalogExercisesConfig/checkUpdateExercises',{studentCourseId:'${SC}',courseId:'${CID}',majorId:'${MID}',unitId:unit.id,version:'BK_RJGC_2024'});
  const r3=await P('studyRecordExercises/exercisesList',{studentCourseId:'${SC}',courseId:'${CID}',majorId:'${MID}',unitId:unit.id,version:'BK_RJGC_2024'});
  const rec=await G('/gateway/system/orgStudent/studyVideo?studentCourseId=${SC}&videoId='+vid.videoId+'&studentId='+u.id+'&majorId=${MID}&version=BK_RJGC_2024');
  const qs=(Array.isArray(r3.data)?r3.data:[]).map(q=>({qid:q.id,type:q.questionType,name:q.name||q.catalogName,content:String(q.questionName||q.content||'').slice(0,50),ref:q.referenceAnswer,ans:q.submitAnswer,st:q.studyExerciseStatus,opts:(q.optionVos||[]).map(o=>({id:o.id,flag:o.answerFlag,name:o.optionName||o.name}))}));
  return JSON.stringify({unit:{id:unit.id,name:unit.catalogName||unit.name,videoId:vid.videoId,videoName:vid.catalogName,secs:vid.timeLength,st:vid.studyVideoStatus},
    r1:{code:r1.code,msg:String(r1.msg).slice(0,40),data:Array.isArray(r1.data)?r1.data.length:typeof r1.data},
    r2:{code:r2.code,data:typeof r2.data==='object'?Object.keys(r2.data||{}).slice(0,8).join(','):String(r2.data)},
    r3:{code:r3.code,msg:String(r3.msg).slice(0,40),n:qs.length,keys:(Array.isArray(r3.data)&&r3.data[0])?Object.keys(r3.data[0]).join(','):''},qs,
    before:rec.data})
})()`));
if (out.err) { console.log(out.err); process.exit(1); }
console.log(`单元「${out.unit.videoName}」unit=${out.unit.id}  video=${out.unit.videoId}  ${out.unit.secs}s  studyVideoStatus=${out.unit.st}`);
console.log(`  ① exerciseBarrier  code=${out.r1.code} data=${out.r1.data}`);
console.log(`  ② checkUpdateExercises code=${out.r2.code} data键=${out.r2.data}`);
console.log(`  ③ exercisesList     code=${out.r3.code} msg=${out.r3.msg} → ${out.r3.n} 道题`);
console.log(`     题目字段: ${out.r3.keys}`);
for (const q of out.qs) console.log(`     题型=${q.type} 干=${q.content} 参考=${String(q.ref).slice(0, 34)} 已答=${q.ans || '无'} 选项flags=${JSON.stringify(q.opts.map((o) => o.flag))}`);
const b = out.before || {};
console.log(`\n【基线】studyVideo: 记录id=${b.id} startPos=${b.startPos} stopPos=${b.stopPos} maxCurrentPos=${b.maxCurrentPos} 最后写入=${b.studyTime}`);
if (!out.qs.length) { console.log('\n这个单元没有题，换一个'); process.exit(0); }
if (!APPLY) { console.log('\n（只读到此为止，没有提交。加 --apply 才作答）'); process.exit(0); }

// 答案来源双证：referenceAnswer 必须等于 optionVos 里 answerFlag==1 的那个 id，否则不提交这道题
const built = out.qs.map((q) => {
  const right = q.opts.filter((o) => o.flag === 1).map((o) => o.id);
  const ok = right.length === 1 && right[0] === q.ref;
  return { submitAnswer: q.ref, exercisesId: q.qid, questionType: q.type, referenceAnswer: q.ref, recordId: null, updateCount: 0, ok, unitId: out.unit.id, courseId: CID };
});
const unsure = built.filter((b) => !b.ok);
if (unsure.length) { console.log(`\n✗ ${unsure.length} 道题 referenceAnswer 与 optionVos.answerFlag 不一致，本次不提交（宁可不做，不做没把握的答）`); for (const q of out.qs.filter((x) => !built.find((b) => b.exercisesId === x.qid && b.ok))) console.log(`   题型=${q.type} 参考=${String(q.ref).slice(0, 40)} flags=${JSON.stringify(q.opts.map((o) => ({ id: o.id.slice(0, 8), f: o.flag })))}`); process.exit(0); }

const sub = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const u=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const P=(x,b)=>fetch(x[0]==='/'?x:'/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(async r=>({http:r.status,body:(await r.text()).slice(0,400)})).catch(e=>({http:0,body:String(e).slice(0,200)}));
  const poList=${JSON.stringify(built.map(({ ok, ...rest }) => rest))};
  // 关键：提交前必须先拿 operationId（昨天整天的 501 就是漏了它，不是平台故障）
  const ck=await P('/gateway/study/courseCatalogExercisesConfig/checkUpdateExercises',{studentCourseId:'${SC}',courseId:'${CID}',majorId:'${MID}',unitId:'${out.unit.id}',version:'BK_RJGC_2024'});
  let oid='';try{const j=JSON.parse(ck.body);oid=(j.data&&(j.data.operationId||j.data.id))||j.operationId||''}catch(e){}
  const base={poList,studentCourseId:'${SC}',studentId:u.id,courseId:'${CID}',unitId:'${out.unit.id}',videoId:'${out.unit.videoId}',majorId:'${MID}',version:'BK_RJGC_2024'};
  const c1=await P('studyRecordExercises/createExercisesList',Object.assign({operationId:oid},base));
  const c2=await P('studyRecordExercises/createList',Object.assign({operationId:oid},base));
  return JSON.stringify({ck,oid,c1,c2})
})()`));
console.log('\n=== 提交结果 ===');
console.log(`checkUpdateExercises http=${sub.ck.http} ${sub.ck.body.slice(0, 240)}`);
console.log(`operationId = ${sub.oid || '（没拿到）'}`);
console.log(`createExercisesList http=${sub.c1.http} ${sub.c1.body.slice(0, 240)}`);
console.log(`createList          http=${sub.c2.http} ${sub.c2.body.slice(0, 240)}`);
if (!sub.oid || /"code":501/.test(sub.c1.body + sub.c2.body)) { console.log('\n仍被拒 —— 没拿到可用的 operationId 或提交被服务端拒绝，本次不下任何结论'); ws.close(); process.exit(1); }

await new Promise((r) => setTimeout(r, 9000));
const after = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t};
  const u=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const bs=await fetch('/gateway/system/orgStudent/listCourseBarrier?courseId=${CID}&majorId=${MID}&userId='+u.id+'&version=BK_RJGC_2024&studentCourseId=${SC}',{headers:H}).then(r=>r.json());
  let st=null;
  for(const b of bs.data||[]){const n2=await fetch('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId=${SC}',{headers:H}).then(r=>r.json());
    for(const n of n2.data||[]) if(n.videoId==='${out.unit.videoId}') st={studyVideoStatus:n.studyVideoStatus,studyExerciseStatus:n.studyExerciseStatus}}
  const rec=await fetch('/gateway/system/orgStudent/studyVideo?studentCourseId=${SC}&videoId=${out.unit.videoId}&studentId='+u.id+'&majorId=${MID}&version=BK_RJGC_2024',{headers:H}).then(r=>r.json());
  const l=await fetch('/gateway/study/studyRecordExercises/exercisesList',{method:'POST',headers:{Authorization:t,'Content-Type':'application/json'},body:JSON.stringify({studentCourseId:'${SC}',courseId:'${CID}',majorId:'${MID}',unitId:'${out.unit.id}',version:'BK_RJGC_2024'})}).then(r=>r.json());
  return JSON.stringify({st,rec:rec.data,answered:(Array.isArray(l.data)?l.data:[]).map(q=>({ans:q.submitAnswer,st:q.studyExerciseStatus,rec:q.recordId}))})
})()`));
const a = after.st || {};
console.log(`\n【提交后】studyVideoStatus=${a.studyVideoStatus}（基线 ${out.unit.st}）  studyExerciseStatus=${a.studyExerciseStatus}`);
console.log(`  作答状态: ${JSON.stringify(after.answered)}`);
console.log(`  视频记录: id=${after.rec && after.rec.id} startPos=${after.rec && after.rec.startPos} stopPos=${after.rec && after.rec.stopPos}`);
console.log(a.studyVideoStatus === 2 ? '\n★ 做题把视频翻成了「已完成」—— 这就是自动刷课的钥匙' : '\n✗ 视频状态没翻 —— 做题与视频完成态是两件事');
ws.close(); process.exit(0);
