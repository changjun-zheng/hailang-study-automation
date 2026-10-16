// 只读盘点「知识练习」层（挂在知识点上，不在章节习题口径里）。
// 单元 id 直接取 courseCatalog/tree 的节点 id，因此闯关制与非闯关制课程都能覆盖。
// 全程只读：不调 createList、不领 operationId。
//   node .cdp/kn-inventory.mjs <课程名关键词>
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.argv[2] || '前端框架开发技术';
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
  const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(e=>({err:String(e)}));
  const cs=await fetch('/gateway/frequent/orgStudent/pagedMyCourse',{method:'POST',headers:H,body:JSON.stringify({filters:{courseNature:null,name:'',schoolYear:'',studentId:me.id,term:'',courseFlag:0},pageIndex:1,pageSize:50})}).then(r=>r.json());
  const recs=(cs.data&&(cs.data.records||cs.data.list))||[];
  const c=recs.find(x=>String(x.name||'').includes(${JSON.stringify(KEY)}));
  if(!c) return JSON.stringify({err:'没这门课，可选：'+recs.map(x=>x.name).join(' / ')});
  const sid=c.studentCourseId||c.id;
  const tr=await P('courseCatalog/tree',{courseId:c.id});
  const units=[];
  const walk=(n)=>{ const kns=n.courseKnowledgeNodeGraphList||[]; if(kns.length) units.push({unitId:n.id,unitName:n.name||n.sortName,kns:kns.map(k=>({id:k.id,name:k.name}))}); for(const x of (n.childList||[])) walk(x); };
  walk(tr.data||{});
  const norm=(v)=>String(v||'').split(/[|,]/).map(s=>s.trim()).filter(Boolean).sort().join(',');
  const rows=[]; let calls=0, errs=0;
  for(const u of units){
    let total=0,answered=0,can=0,withQ=0; const types={};
    for(const k of u.kns){
      const l=await P('studyKnowledgeExerciseRecord/exercisesList',{knowledgeNodeId:k.id,studentCourseId:sid,unitId:u.unitId});
      calls++;
      if(l.err||!Array.isArray(l.data)){ errs++; continue; }
      const qs=l.data; if(qs.length) withQ++;
      for(const q of qs){
        total++;
        if(q.submitAnswer) answered++;
        const right=(q.optionVos||[]).filter(o=>o.answerFlag===1).map(o=>o.id);
        let ok=false;
        if(q.questionType===1) ok=right.length===1&&norm(right)===norm(q.referenceAnswer);
        else if(q.questionType===2) ok=right.length>1&&norm(right)===norm(q.referenceAnswer);
        else if(q.questionType===3) ok=/^[01]$/.test(String(q.referenceAnswer==null?'':q.referenceAnswer).trim());
        if(ok&&!q.submitAnswer) can++;
        const kk=q.questionType+'='+(q.questionTypeName||'题型'+q.questionType);
        types[kk]=(types[kk]||0)+1;
      }
    }
    if(total) rows.push({unit:u.unitName,kn:u.kns.length,withQ,total,answered,can,types:Object.entries(types).map(([a,b])=>a+':'+b).join(' ')});
  }
  return JSON.stringify({course:c.name,sid,cid:c.id,version:c.version,unitWithKn:units.length,calls,errs,rows})
})()`;

const o = JSON.parse(await evl(expr));
if (o.err) { console.log(o.err); ws.close(); process.exit(1); }
const sum = (k) => o.rows.reduce((a, r) => a + r[k], 0);
console.log(`课程「${o.course}」 有知识点的单元 ${o.unitWithKn} 个，读了 ${o.calls} 次（失败 ${o.errs}）`);
console.log(`知识练习合计 ${sum('total')} 道：已答 ${sum('answered')}，可自动作答 ${sum('can')}，需生成/不代做 ${sum('total') - sum('answered') - sum('can')}`);
console.log(`有题的知识点 ${sum('withQ')} 个：`);
for (const r of o.rows) console.log(`  ${String(r.unit).slice(0, 24).padEnd(26)} 知识点${String(r.kn).padStart(2)} 题${String(r.total).padStart(3)} 已答${r.answered} 可做${String(r.can).padStart(3)}  ${r.types}`);
ws.close(); process.exit(0);
