// 只读：拿一个知识点，把 studyKnowledgeExerciseRecord/exercisesList 的原始返回打出来，
// 并试几种参数组合，看哪一种能返回题目。
//   node .cdp/kn-probe.mjs
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
  const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.text()).catch(e=>'ERR '+e);
  const CID='e8716aab5bc18a56b115d3303f43555c',SC='2c235454cef7b898bd11e77ad2b0d20c',MID='9f07cf1e06d0a57957bd6be34efd3930';
  // 找一个有知识点的单元：用截图里那门课的「存储和显示Vue的数据」
  const tr=JSON.parse(await P('courseCatalog/tree',{courseId:CID}));
  let unit=null;
  const walk=(n)=>{ const kns=n.courseKnowledgeNodeGraphList||[]; if(!unit&&kns.length) unit={unitId:n.id,unitName:n.name,kns:kns.map(k=>({id:k.id,name:k.name}))}; for(const x of (n.childList||[])) walk(x); };
  walk(tr.data||{});
  if(!unit) return JSON.stringify({err:'树里没找到带知识点的单元'});
  const kn=unit.kns[0];
  const r={unit:unit.unitName,unitId:unit.unitId,kn:kn.name,knId:kn.id,tries:{}};
  const J=(s)=>{try{const j=JSON.parse(s);return 'code='+j.code+' msg='+String(j.msg||'').slice(0,40)+' n='+(Array.isArray(j.data)?j.data.length:'data非数组')}catch(e){return '非JSON: '+s.slice(0,90)}};
  r.tries['最小三件套'] = await P('studyKnowledgeExerciseRecord/exercisesList',{knowledgeNodeId:kn.id,studentCourseId:SC,unitId:unit.unitId});
  r.tries['加 courseId'] = await P('studyKnowledgeExerciseRecord/exercisesList',{knowledgeNodeId:kn.id,studentCourseId:SC,unitId:unit.unitId,courseId:CID});
  r.tries['加 courseId+majorId'] = await P('studyKnowledgeExerciseRecord/exercisesList',{knowledgeNodeId:kn.id,studentCourseId:SC,unitId:unit.unitId,courseId:CID,majorId:MID});
  r.tries['加 version'] = await P('studyKnowledgeExerciseRecord/exercisesList',{knowledgeNodeId:kn.id,studentCourseId:SC,unitId:unit.unitId,courseId:CID,majorId:MID,version:'BK_RJGC_2024'});
  r.tries['用 businessId'] = await P('studyKnowledgeExerciseRecord/exercisesList',{knowledgeNodeId:kn.biz||kn.id,studentCourseId:SC,unitId:unit.unitId,courseId:CID,version:'BK_RJGC_2024'});
  // 取 businessId 再试一次
  const raw=JSON.parse(await P('courseCatalog/tree',{courseId:CID}));
  let biz=null; const w2=(n)=>{ for(const k of (n.courseKnowledgeNodeGraphList||[])) if(k.id===kn.id) biz=k.businessId; for(const x of (n.childList||[])) w2(x); };
  w2(raw.data||{});
  r.biz=biz;
  if(biz) r.tries['knowledgeNodeId=businessId'] = await P('studyKnowledgeExerciseRecord/exercisesList',{knowledgeNodeId:biz,studentCourseId:SC,unitId:unit.unitId,courseId:CID,version:'BK_RJGC_2024'});
  r.summary=Object.fromEntries(Object.entries(r.tries).map(([k,v])=>[k,J(v)]));
  return JSON.stringify(r)
})()`;

const o = JSON.parse(await evl(expr));
if (o.err) { console.log(o.err); ws.close(); process.exit(1); }
console.log(`单元「${o.unit}」unitId=${String(o.unitId).slice(0, 12)} 知识点「${o.kn}」id=${String(o.knId).slice(0, 12)} businessId=${String(o.biz).slice(0, 12)}`);
console.log('\n各参数组合的返回：');
for (const [k, v] of Object.entries(o.summary)) console.log(`  ${k.padEnd(24)} ${v}`);
ws.close(); process.exit(0);
