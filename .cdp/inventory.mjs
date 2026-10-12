// 只读盘点：按单元统计某门课的习题构成，以及"平台答案与选项双证一致、可自动作答"有多少道。
// 全程不提交：不调 checkUpdateExercises（那是领 operationId）、不调 createExercisesList / createList。
// 副作用披露：每个单元要调一次 exercisesList，它会占用平台"同一时刻只允许一个"的习题会话，
// 读完立刻 clearStudentUnit 释放；被释放的是会话而不是作答记录。
//   node .cdp/inventory.mjs 框架程序设计
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.argv[2] || '框架程序设计';
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');

const all = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && t.url.includes('study.cqie.edu.cn'));
let KEEP = null; try { KEEP = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id; } catch {}
const full = all.find((t) => t.id === KEEP) || all[0];
if (!full) { console.log('找不到 study 标签页'); process.exit(1); }
const ws = new WebSocket(full.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', String(r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

const expr = `(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const G=(x)=>fetch(x,{headers:{Authorization:t}}).then(r=>r.json()).catch(e=>({err:String(e)}));
  const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(e=>({err:String(e)}));
  const cs=await fetch('/gateway/frequent/orgStudent/pagedMyCourse',{method:'POST',headers:H,body:JSON.stringify({filters:{courseNature:null,name:'',schoolYear:'',studentId:me.id,term:'',courseFlag:0},pageIndex:1,pageSize:50})}).then(r=>r.json());
  const recs=(cs.data&&(cs.data.records||cs.data.list))||[];
  const c=recs.find(x=>String(x.name||'').includes(${JSON.stringify(KEY)}));
  if(!c) return JSON.stringify({err:'课程列表里没有，可选：'+recs.map(x=>x.name).join(' / ')});
  const sid=c.studentCourseId||c.id;
  const units=[]; let enumMode='barrier';
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId='+c.id+'&majorId='+me.majorId+'&userId='+me.id+'&version='+c.version+'&studentCourseId='+sid);
  for(const b of (bs.data||[])){const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId='+sid);
    for(const n of ns.data||[]) if(n.videoId&&!units.some(x=>x.unitId===n.id)) units.push({barrier:b.name,unitId:n.id,unitName:n.catalogName})}
  if(!units.length){
    enumMode='catalogTree';
    const tree=await P('courseCatalog/tree',{courseId:c.id});
    const walk=(n,parent)=>{ for(const x of (n.childList||[])){ if((x.videoCount||0)>0&&!units.some(u=>u.unitId===x.id)) units.push({barrier:parent||'',unitId:x.id,unitName:x.name||x.sortName}); walk(x,x.name||parent); } };
    walk(tree.data||{});
  }
  const norm=(v)=>String(v||'').split(/[|,]/).map(s=>s.trim()).filter(Boolean).sort().join(',');
  const rows=[]; const qids=new Set(); const bankSig=new Set();
  for(const s of units){
    await P('studyRecordExercises/exerciseBarrier',{studentCourseId:sid,unitId:s.unitId});
    const l=await P('studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:c.id,majorId:me.majorId,unitId:s.unitId,version:c.version});
    const qs=Array.isArray(l.data)?l.data:[];
    for(const q of qs){ qids.add(String(q.id)); bankSig.add(String(q.exercisesId||q.questionId||q.bankId||q.id)+'|'+String(q.referenceAnswer||'').slice(0,40)); }
    let can=0; const tmap={};
    for(const q of qs){
      const right=(q.optionVos||[]).filter(o=>o.answerFlag===1).map(o=>o.id);
      let ok=false;
      if(q.questionType===1) ok=right.length===1&&norm(right)===norm(q.referenceAnswer);
      else if(q.questionType===2) ok=right.length>1&&norm(right)===norm(q.referenceAnswer);
      else if(q.questionType===3) ok=/^[01]$/.test(String(q.referenceAnswer==null?'':q.referenceAnswer).trim());
      if(ok&&!q.submitAnswer) can++;
      const k=q.questionType+'='+(q.questionTypeName||('题型'+q.questionType));
      tmap[k]=(tmap[k]||0)+1;
    }
    rows.push({unit:s.unitName,barrier:s.barrier,total:qs.length,answered:qs.filter(q=>!!q.submitAnswer).length,can,types:Object.entries(tmap).map(([k,v])=>k+':'+v).join(' ')});
    await P('studyRecordExercises/clearStudentUnit',{studentCourseId:sid,unitId:s.unitId});
  }
  return JSON.stringify({course:c.name,enumMode,unitCount:units.length,distinctIds:qids.size,distinctBank:bankSig.size,rows})
})()`;

const o = JSON.parse(await evl(expr));
if (o.err) { console.log(o.err); ws.close(); process.exit(1); }
console.log(`课程「${o.course}」 枚举方式=${o.enumMode} 单元数=${o.unitCount}`);
const sum = (k) => o.rows.reduce((a, r) => a + r[k], 0);
console.log(`共 ${sum('total')} 道题，已答 ${sum('answered')} 道，可自动作答（双证一致且未答）${sum('can')} 道`);
// 平台"练习清单"给的条数与逐单元累加可能不是一个口径：题目会跨单元复用。
console.log(`  去重后：不同 exercisesList.id = ${o.distinctIds} 道，按题库标识去重 = ${o.distinctBank} 道`);
console.log(`有题的单元 ${o.rows.filter((r) => r.total > 0).length} 个：`);
for (const r of o.rows.filter((x) => x.total > 0)) {
  console.log(`  ${String(r.unit).slice(0, 26).padEnd(28)} 共${String(r.total).padStart(3)} 已答${r.answered} 可做${String(r.can).padStart(3)}  ${r.types}`);
}
const skipped = sum('total') - sum('answered') - sum('can');
console.log(`\n不能自动作答（主观题/编程题/设计题，或答案与选项对不上）= ${skipped} 道`);
ws.close(); process.exit(0);
