// 用类型探针摸成绩提交接口 studyRecordExercises/createExercisesList 的 DTO 字段。
// 安全性：全程不带 operationId —— 业务校验会先拒绝（501 操作ID不能为空），所以不会写入任何记录；
//         而 Jackson 的解析错误发生在业务校验之前，类型不符照样能报出字段名。
// 先跑「前提校验」：确认不带 operationId 时确实被拒、确实没写。
//   node .cdp/probe-submit-dto.mjs
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
const UNIT = '43004df89e9325e5d3cbd659af64c720';
const QID = '60ae1e9d2f0af47470cae307ada80e34';   // 一道编程题（type 7）
const NAMES = ['submitAnswer', 'submitFile', 'runFile', 'gitFiles', 'codeList', 'fileList', 'files',
  'text', 'code', 'content', 'language', 'languageName', 'exercisesId', 'questionType', 'referenceAnswer',
  'recordId', 'updateCount', 'exercisesConfigId', 'segmentKnowledgeId', 'unitId', 'studentCourseId',
  'courseId', 'videoId', 'majorId', 'version', 'studentId', 'knowledgeNodeId', 'submitTime', 'remark',
  'studyRecordExercisesFileVos', 'sourceMaterialUrl', 'baseFileUrl'];

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.url && t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

const out = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const EP='/gateway/study/studyRecordExercises/createExercisesList';
  const names=${JSON.stringify(NAMES)};
  const P=(b)=>fetch(EP,{method:'POST',headers:H,body:JSON.stringify(b)}).then(async x=>({http:x.status,tx:await x.text()})).catch(e=>({http:0,tx:String(e)}));
  // 前提：不带 operationId 必须被业务校验拒掉。不成立就立刻中止，一个探针都不发 ——
  // 否则就是在往账号里写垃圾记录，而我还打算事后才看这个前提成不成立。
  const base=await P({});
  if(!/操作ID不能为空|不能为空/.test(base.tx)) return JSON.stringify({aborted:true,reason:'不带 operationId 竟然没被拒绝，探针可能有写入副作用',base:{http:base.http,tx:base.tx.replace(/\s+/g,' ').slice(0,200)}});
  // 探针 A：把候选字段塞进 poList 元素里，值给对象（String 型字段会报类型错）
  const resA=[];
  for(const n of names){
    const r=await P({poList:[{exercisesId:'${QID}',questionType:7,[n]:{}}]});
    const isParse=/JSON parse error|MismatchedInput|UnrecognizedProperty/.test(r.tx);
    let fld=null; const qi=r.tx.indexOf('Qo[');
    if(qi>-1){const a=r.tx.indexOf('"',qi),b=r.tx.indexOf('"',a+1); if(a>-1&&b>a) fld=r.tx.slice(a+1,b)}
    resA.push({n,isParse,fld,brief:r.tx.replace(/\\s+/g,' ').slice(0,90)});
  }
  // 探针 B：外层字段（poList 本身、以及可能的兄弟字段）给错类型
  const resB=[];
  for(const n of ['poList','operationId','studentCourseId','unitId','videoId','courseId','studentId','fileList','codeList','text','code','submitAnswer']){
    const r=await P({[n]: n==='poList' ? 'x' : {}});
    resB.push({n,isParse:/JSON parse error|MismatchedInput/.test(r.tx),brief:r.tx.replace(/\\s+/g,' ').slice(0,110)});
  }
  return JSON.stringify({base:{http:base.http,tx:base.tx.replace(/\\s+/g,' ').slice(0,150)},resA,resB})
})()`));
if (out.aborted) { console.log('★ 中止：' + out.reason); console.log('  空 body 响应: http=' + out.base.http + ' ' + out.base.tx); ws.close(); process.exit(1); }
console.log('前提校验（不带 operationId 的空 body）：http=' + out.base.http + '  ' + out.base.tx);
console.log(/操作ID不能为空/.test(out.base.tx) ? '  ✓ 被业务校验拒绝 → 这些探针不会写入任何记录\n' : '  ✗ 没被拒绝，探针可能有副作用，停止解读\n');
console.log('探针 A —— poList 元素里的字段（值给 {} ，String 型会报类型错）：');
const hitA = out.resA.filter((r) => r.isParse);
for (const r of out.resA) if (r.isParse) console.log(`  ✓ ${r.n.padEnd(24)} ${r.fld ? '属性名=' + r.fld : ''}  ${r.brief.slice(0, 70)}`);
if (!hitA.length) console.log('  （无一触发解析错误）');
console.log('\n探针 B —— 外层字段：');
for (const r of out.resB) if (r.isParse) console.log(`  ✓ ${r.n.padEnd(20)} ${r.brief.slice(0, 96)}`);
const hitB = out.resB.filter((r) => r.isParse);
if (!hitB.length) console.log('  （无一触发解析错误）');
ws.close(); process.exit(0);
