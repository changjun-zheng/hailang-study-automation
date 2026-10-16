// 只读：对知识练习的读题接口做有界矩阵探测——补 videoId/courseId/majorId/version，
// 以及试几个候选 controller/action 名。不提交任何答案。
//   node .cdp/kn-matrix.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
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
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const CID='e8716aab5bc18a56b115d3303f43555c',SC='2c235454cef7b898bd11e77ad2b0d20c',MID='9f07cf1e06d0a57957bd6be34efd3930',VER='BK_RJGC_2024';
  const tr=await (await fetch('/gateway/study/courseCatalog/tree',{method:'POST',headers:H,body:JSON.stringify({courseId:CID})})).json();
  let unit=null;
  const w=(n)=>{ if(!unit&&(n.courseKnowledgeNodeGraphList||[]).length) unit=n; for(const x of (n.childList||[])) w(x); };
  w(tr.data||{});
  const kn=unit.courseKnowledgeNodeGraphList[0];
  const vid=((unit.courseCatalogVideoVos||[])[0]||{}).id||null;
  const post=async(p,b)=>{try{
    const r=await fetch('/gateway/study/'+p,{method:'POST',headers:H,body:JSON.stringify(b)});
    const txt=String(await r.text());
    let j=null;try{j=JSON.parse(txt)}catch(e){}
    if(!j)return 'HTTP'+r.status+' 非JSON '+txt.slice(0,60);
    const n=Array.isArray(j.data)?j.data.length:null;
    return 'code='+j.code+' msg='+String(j.msg)+' '+(n!==null?'★数组'+n+'条':'data='+JSON.stringify(j.data).slice(0,40))}catch(e){return '抛异常 '+String(e).slice(0,80)}};
  const out={};
  const base={knowledgeNodeId:kn.id,studentCourseId:SC,unitId:unit.id};
  out['+videoId']=await post('studyKnowledgeExerciseRecord/exercisesList',{...base,videoId:vid});
  out['+courseId+videoId']=await post('studyKnowledgeExerciseRecord/exercisesList',{...base,videoId:vid,courseId:CID});
  out['+全字段']=await post('studyKnowledgeExerciseRecord/exercisesList',{...base,videoId:vid,courseId:CID,majorId:MID,version:VER,studentId:me.id});
  out['businessId+videoId']=await post('studyKnowledgeExerciseRecord/exercisesList',{knowledgeNodeId:kn.businessId,studentCourseId:SC,unitId:unit.id,videoId:vid,courseId:CID});
  // 候选 controller/action
  const bodies=[{...base,videoId:vid,courseId:CID}];
  for(const ep of ['studyKnowledgeExerciseRecord/list','studyKnowledgeExerciseRecord/knowledgeExercisesList','courseCatalogKnowledgeExercise/exercisesList','courseCatalogKnowledgeExercise/list','studyKnowledgeExerciseRecord/getExercises','studyKnowledgeExerciseRecord/exerciseList']){
    out['端点 '+ep]=await post(ep,bodies[0]);
  }
  return JSON.stringify({unitName:unit.name,knName:kn.name,vid,out})
})()`;

const o = JSON.parse(await evl(expr));
console.log(`单元「${o.unitName}」知识点「${o.knName}」videoId=${String(o.vid).slice(0, 14)}`);
for (const [k, v] of Object.entries(o.out)) console.log(`  ${k.padEnd(26)} ${v}`);
ws.close(); process.exit(0);
