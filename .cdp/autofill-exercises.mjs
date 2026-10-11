// 自动答题：遍历一门课所有单元的「习题」，只提交「客观题 + 双证一致」的答案，编程题/主观题一律跳过
//   node .cdp/autofill-exercises.mjs [--course 课程名] [--apply]
// 双证 = referenceAnswer 必须等于 optionVos 中 answerFlag==1 的那个 id 集合
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const APPLY = process.argv.includes('--apply');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const COURSE = arg('--course', '前端框架开发技术');
const CID = arg('--courseId', 'e8716aab5bc18a56b115d3303f43555c');
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
const TYPES = { 1: '单选', 2: '多选', 3: '判断', 4: '填空', 7: '编程' };

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.log('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 240)); process.exit(1); } return r.result?.value; };

const run = await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const u=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(()=>({}));
  const G=(x)=>fetch(x,{headers:H}).then(r=>r.json()).catch(()=>({}));
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId=${CID}&majorId=${MID}&userId='+u.id+'&version=BK_RJGC_2024&studentCourseId=${SC}');
  const units=[];
  for(const b of (bs.data||[]).slice().sort((a,c)=>(a.sortCode||0)-(c.sortCode||0))){
    const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId=${SC}');
    for(const n of ns.data||[]) if(n.videoId && !units.some(x=>x.unitId===n.id)) units.push({barrier:b.name,unitId:n.id,unitName:n.catalogName,videoId:n.videoId});
  }
  const out=[];
  for(const s of units){
    const l=await P('studyRecordExercises/exercisesList',{studentCourseId:'${SC}',courseId:'${CID}',majorId:'${MID}',unitId:s.unitId,version:'BK_RJGC_2024'});
    const qs=Array.isArray(l.data)?l.data:[];
    if(!qs.length) continue;
    const items=qs.map(q=>({qid:q.id,type:q.questionType,ref:q.referenceAnswer,ans:q.submitAnswer,
      right:(q.optionVos||[]).filter(o=>o.answerFlag===1).map(o=>o.id)}));
    let oid='';
    if(${JSON.stringify(APPLY)}){
      const ck=await P('courseCatalogExercisesConfig/checkUpdateExercises',{studentCourseId:'${SC}',courseId:'${CID}',majorId:'${MID}',unitId:s.unitId,version:'BK_RJGC_2024'});
      oid=(ck.data&&(ck.data.operationId||ck.data.id))||'';
    }
    let submit=null;
    const ready=items.filter(x=>[1,2,3,4].includes(x.type)&&!x.ans&&x.right.length&&x.right.join(',')===String(x.ref||'').split(',').sort().join(','));
    if(${JSON.stringify(APPLY)}&&ready.length&&oid){
      const poList=ready.map(x=>({submitAnswer:x.ref,exercisesId:x.qid,questionType:x.type,referenceAnswer:x.ref,recordId:null,updateCount:0}));
      const r=await P('studyRecordExercises/createExercisesList',{poList,operationId:oid,studentCourseId:'${SC}',studentId:u.id,courseId:'${CID}',unitId:s.unitId,videoId:s.videoId,majorId:'${MID}',version:'BK_RJGC_2024'});
      submit={code:r.code,n:Array.isArray(r.data)?r.data.length:0,msg:String(r.msg||'').slice(0,40)};
    }
    out.push({barrier:s.barrier,unitName:s.unitName,items:items.map(x=>({type:x.type,answered:!!x.ans,verified:x.right.join(',')===String(x.ref||'').split(',').sort().join(',')})),submit});
  }
  return JSON.stringify(out)
})()`);
const list = JSON.parse(run);
let tot = 0, done = 0, submittable = 0, skipped = 0, sent = 0;
for (const s of list) {
  tot += s.items.length;
  done += s.items.filter((i) => i.answered).length;
  submittable += s.items.filter((i) => !i.answered && [1, 2, 3, 4].includes(i.type) && i.verified).length;
  skipped += s.items.filter((i) => !i.answered && !([1, 2, 3, 4].includes(i.type) && i.verified)).length;
  if (s.submit && s.submit.code === 200) sent += s.submit.n;
  if (s.submit) console.log(`  提交 ${s.unitName}: code=${s.submit.code} 写入${s.submit.n}条 ${s.submit.msg}`);
}
console.log(`\n单元 ${list.length} 个有习题；题目合计 ${tot} 道`);
console.log(`  已答 ${done} 道`);
console.log(`  可自动作答（客观题且参考答案与选项 answerFlag 双证一致）${submittable} 道`);
console.log(`  跳过（编程题/多选答案对不上/其它）${skipped} 道 —— 这些不提交`);
console.log(APPLY ? `\n本次实际提交 ${sent} 道` : '\n（干跑，没有提交任何东西；加 --apply 才写）');
ws.close(); process.exit(0);
