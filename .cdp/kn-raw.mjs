// 只读：把 studyKnowledgeExerciseRecord/exercisesList 的原始响应打出来（含 HTTP 状态与完整 body），
// 并用类型不匹配探针问出真实字段名。不提交任何答案。
//   node .cdp/kn-raw.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const KN = '03a95dbbdcee0000000000000000000'; // 占位，下面从树里取真值
const all = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && t.url.includes('study.cqie.edu.cn'));
let KEEP = null; try { KEEP = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id; } catch {}
const full = all.find((t) => t.id === KEEP) || all[0];
const ws = new WebSocket(full.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', String(r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

const expr = `(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const CID='e8716aab5bc18a56b115d3303f43555c',SC='2c235454cef7b898bd11e77ad2b0d20c';
  const post=async(p,b)=>{const r=await fetch('/gateway/study/'+p,{method:'POST',headers:H,body:JSON.stringify(b)});return 'HTTP '+r.status+' | '+(await r.text()).slice(0,420)};
  const tr=await (await fetch('/gateway/study/courseCatalog/tree',{method:'POST',headers:H,body:JSON.stringify({courseId:CID})})).json();
  let unit=null,kn=null;
  const w=(n)=>{ if(!kn&&(n.courseKnowledgeNodeGraphList||[]).length){kn=n.courseKnowledgeNodeGraphList[0];unit=n;} for(const x of (n.childList||[])) w(x); };
  w(tr.data||{});
  const out={unitName:unit&&unit.name,unitId:unit&&unit.id,knName:kn&&kn.name,knId:kn&&kn.id,biz:kn&&kn.businessId,calls:{}};
  out.calls['原始三件套']=await post('studyKnowledgeExerciseRecord/exercisesList',{knowledgeNodeId:kn.id,studentCourseId:SC,unitId:unit.id});
  out.calls['空body']=await post('studyKnowledgeExerciseRecord/exercisesList',{});
  out.calls['knowledgeNodeId给对象(探字段名)']=await post('studyKnowledgeExerciseRecord/exercisesList',{knowledgeNodeId:{},studentCourseId:SC,unitId:unit.id});
  out.calls['unitId给对象']=await post('studyKnowledgeExerciseRecord/exercisesList',{knowledgeNodeId:kn.id,studentCourseId:SC,unitId:{}});
  out.calls['用businessId当id']=await post('studyKnowledgeExerciseRecord/exercisesList',{knowledgeNodeId:kn.businessId,studentCourseId:SC,unitId:unit.id});
  out.calls['check接口']=await post('studyKnowledgeExerciseRecord/checkStudyKnowledgeExerciseRecord',{knowledgeNodeId:kn.id,studentCourseId:SC,unitId:unit.id,courseId:CID});
  return JSON.stringify(out)
})()`;

const o = JSON.parse(await evl(expr));
console.log(`单元「${o.unitName}」unitId=${String(o.unitId).slice(0, 14)} 知识点「${o.knName}」id=${String(o.knId).slice(0, 14)} businessId=${o.biz}`);
for (const [k, v] of Object.entries(o.calls)) console.log(`\n--- ${k} ---\n${v}`);
ws.close(); process.exit(0);
