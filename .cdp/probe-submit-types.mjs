// 把 createExercisesList 的 DTO 字段类型逐个读出来：给字段塞一个数组值，Jackson 的报错里会写明它期望什么类型。
// 安全性：所有请求都不带必填的 studentCourseId，业务校验一定先拒，不会写入任何记录。
//   node .cdp/probe-submit-types.mjs
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const QID = '60ae1e9d2f0af47470cae307ada80e34';
const FIELDS = ['submitAnswer', 'submitFile', 'exercisesId', 'questionType', 'referenceAnswer', 'recordId',
  'exercisesConfigId', 'updateCount', 'segmentKnowledgeId', 'submitTime', 'remark', 'runFile', 'gitFiles',
  'studyRecordExercisesFileVos', 'sourceMaterialUrl', 'baseFileUrl', 'codeList', 'fileList', 'text', 'code'];
const OUTER = ['poList', 'operationId', 'studentCourseId', 'unitId', 'courseId', 'videoId', 'studentId',
  'majorId', 'version', 'submitFile', 'submitAnswer', 'fileList', 'codeList', 'text', 'code', 'knowledgeNodeId'];

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
  const fields=${JSON.stringify(FIELDS)}, outer=${JSON.stringify(OUTER)};
  const want=(tx)=>{ const i=tx.indexOf('Cannot deserialize value of type '); if(i<0) return null;
    const a=tx.indexOf(String.fromCharCode(96),i), b=tx.indexOf(String.fromCharCode(96),a+1);
    return a>-1&&b>a ? tx.slice(a+1,b) : null };
  const where=(tx)=>{ const i=tx.indexOf('through reference chain'); if(i<0) return null; return tx.slice(i,i+160) };
  const res=[];
  for(const n of fields){
    // 故意不带 studentCourseId：业务校验必定先拒，所以这一批发射不会落库
    const tx=await fetch(EP,{method:'POST',headers:H,body:JSON.stringify({poList:[{[n]:[]}]})}).then(x=>x.text()).catch(()=>'');
    res.push({scope:'poList[]',n,type:want(tx),parse:/JSON parse error/.test(tx)});
  }
  const res2=[];
  for(const n of outer){
    const tx=await fetch(EP,{method:'POST',headers:H,body:JSON.stringify({[n]:[]})}).then(x=>x.text()).catch(()=>'');
    res2.push({scope:'外层',n,type:want(tx),parse:/JSON parse error/.test(tx)});
  }
  const probe0=await fetch(EP,{method:'POST',headers:H,body:'{}'}).then(x=>x.text()).catch(()=>'');
  return JSON.stringify({probe0,res,res2})
})()`));
console.log('前提（空 body）:', String(out.probe0).replace(/\s+/g, ' ').slice(0, 110));
console.log(out.probe0.includes('不能为空') ? '  ✓ 被必填校验拒绝 → 本批探针不会写入\n' : '  ✗ 前提不成立，结果不可信\n');
console.log('poList 元素字段：');
for (const r of out.res) if (r.parse) console.log(`  ${r.n.padEnd(28)} 期望类型 = ${r.type || '?'}`);
const missA = out.res.filter((r) => !r.parse).map((r) => r.n);
if (missA.length) console.log('  （没触发类型错的，说明不是这些名字或类型本就是数组/对象：' + missA.join(', ') + '）');
console.log('\n外层字段：');
for (const r of out.res2) if (r.parse) console.log(`  ${r.n.padEnd(28)} 期望类型 = ${r.type || '?'}`);
const missB = out.res2.filter((r) => !r.parse).map((r) => r.n);
if (missB.length) console.log('  （无类型错：' + missB.join(', ') + '）');
ws.close(); process.exit(0);
