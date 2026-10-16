// 只读：把编程题在服务端的原始 submitAnswer / submitFile 打出来，
// 用来判「到底算不算已作答」——不能沿用提交时自己填的那个 '[]'。
//   node .cdp/codeq-verify.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';

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
  const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(e=>({err:String(e)}));
  const G=(x)=>fetch(x,{headers:{Authorization:t}}).then(r=>r.json()).catch(e=>({err:String(e)}));
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId=${CID}&majorId=${MID}&userId='+me.id+'&version=BK_RJGC_2024&studentCourseId=${SC}');
  const units=[];
  for(const b of bs.data||[]){const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId=${SC}');
    for(const n of ns.data||[]) if(n.videoId&&!units.some(x=>x.unitId===n.id)) units.push({unitId:n.id,name:n.catalogName})}
  const out=[];
  for(const u of units){
    await P('studyRecordExercises/exerciseBarrier',{studentCourseId:'${SC}',unitId:u.unitId});
    const l=await P('studyRecordExercises/exercisesList',{studentCourseId:'${SC}',courseId:'${CID}',majorId:me.majorId,unitId:u.unitId,version:'BK_RJGC_2024'});
    for(const q of (Array.isArray(l.data)?l.data:[])) if(q.questionType===7) out.push({unit:u.name,qid:String(q.id).slice(0,8),
      submitAnswer:JSON.stringify(q.submitAnswer).slice(0,20),submitFile:String(q.submitFile||'').slice(0,40),
      score:q.score===undefined?'(无字段)':String(q.score),status:q.status===undefined?'(无)':String(q.status)});
    await P('studyRecordExercises/clearStudentUnit',{studentCourseId:'${SC}',unitId:u.unitId});
  }
  return JSON.stringify(out)
})()`;

const rows = JSON.parse(await evl(expr));
console.log(`编程题 ${rows.length} 道的服务端原始字段：`);
for (const r of rows) console.log(`  ${String(r.unit).slice(0, 22).padEnd(24)} submitAnswer=${String(r.submitAnswer).padEnd(10)} submitFile=${r.submitFile} score=${r.score}`);
const withFile = rows.filter((r) => r.submitFile && r.submitFile !== 'null').length;
console.log(`\n带 submitFile 的：${withFile}/${rows.length}  ← 这才是编程题"已作答"的判据`);
ws.close(); process.exit(0);
