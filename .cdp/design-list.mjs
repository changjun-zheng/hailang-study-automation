// 只读：导出未作答的设计题（questionType=8）清单，供产物生成用。
// 输出到 .cdp/design-questions.json：qid/课程/单元/题干纯文本/评分标准/分值/平台模板文件。
//   node .cdp/design-list.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const OUT = path.join(ROOT, '.cdp', 'design-questions.json');

const all = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && t.url.includes('study.cqie.edu.cn'));
if (!all.length) { console.error('没有 study 标签页'); process.exit(1); }
const full = all[0];
const ws = new WebSocket(full.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', String(r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

const expr = `(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(()=>({}));
  const G=(x)=>fetch(x,{headers:{Authorization:t}}).then(r=>r.json()).catch(()=>({}));
  const cs=await fetch('/gateway/frequent/orgStudent/pagedMyCourse',{method:'POST',headers:H,body:JSON.stringify({filters:{courseNature:null,name:'',schoolYear:'',studentId:me.id,term:'',courseFlag:0},pageIndex:1,pageSize:50})}).then(r=>r.json());
  const recs=(cs.data&&(cs.data.records||cs.data.list))||[];
  const out=[];
  for(const c of recs){
    const sid=c.studentCourseId||c.id, ver=c.version||'BK_RJGC_2024';
    let units=[];
    const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId='+c.id+'&majorId='+me.majorId+'&userId='+me.id+'&version='+ver+'&studentCourseId='+sid);
    for(const b of bs.data||[]){const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId='+sid);
      for(const n of ns.data||[]) if(n.videoId&&!units.some(x=>x.unitId===n.id)) units.push({unitId:n.id,name:n.catalogName,videoId:n.videoId});}
    if(!units.length){
      const tr=await P('courseCatalog/tree',{courseId:c.id});
      const walk=(n)=>{ for(const x of (n.childList||[])){ if((x.videoCount||0)>0&&!units.some(u=>u.unitId===x.id)) units.push({unitId:x.id,name:x.name||x.sortName,videoId:null}); walk(x); } };
      walk(tr.data||{});
    }
    for(const u of units){
      await P('studyRecordExercises/exerciseBarrier',{studentCourseId:sid,unitId:u.unitId});
      const l=await P('studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:c.id,majorId:me.majorId,unitId:u.unitId,version:ver});
      for(const q of (Array.isArray(l.data)?l.data:[])){
        if(q.questionType!==8) continue;
        if(q.submitAnswer&&String(q.submitAnswer).trim()&&String(q.submitAnswer)!=='[]') continue;
        out.push({course:c.name,cid:c.id,sid,ver,majorId:me.majorId,unitId:u.unitId,unitName:u.name,videoId:u.videoId,
          qid:q.id,score:q.questionScore,baseFileName:q.baseFileName||null,baseFileUrl:q.baseFileUrl||null,
          content:String(q.content||'').replace(/<br\\s*\\/?>/gi,'\\n').replace(/<[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim(),
          criteria:String(q.scoreCriteria||'').replace(/<[^>]+>/g,'').trim(),
          ref:String(q.referenceAnswer||'').replace(/<[^>]+>/g,'').trim()});
      }
      await P('studyRecordExercises/clearStudentUnit',{studentCourseId:sid,unitId:u.unitId});
    }
  }
  return JSON.stringify(out)
})()`;

const rows = JSON.parse(await evl(expr));
// 同一 qid 会在多个单元重复出现，按 qid 去重（题目本身只有一份）
const uniq = [...new Map(rows.map((r) => [r.qid, r])).values()];
fs.writeFileSync(OUT, JSON.stringify(uniq, null, 1));
console.log(`未作答设计题：槽位 ${rows.length} 个，去重后题目 ${uniq.length} 道`);
console.log(`清单已写入 ${OUT}\n`);
for (const r of uniq) {
  console.log('─'.repeat(72));
  console.log(`【${r.course}】${r.unitName}  qid=${String(r.qid).slice(0, 12)} 分值=${r.score} 模板=${r.baseFileName || '无'}`);
  console.log(`题干: ${r.content.slice(0, 300)}`);
  console.log(`评分: ${r.criteria.slice(0, 160) || '(无)'}`);
  console.log(`平台答案: ${r.ref.slice(0, 80) || '(空)'}`);
}
ws.close(); process.exit(0);
