// 只读：统计五门课里主观题（5 简答 / 6 问答 / 8 设计）的分布，并区分
// 「平台已下发参考答案（直接搬运即可）」与「平台没给答案（必须生成）」。
// 这一步决定生成器要不要接模型、要生成多少。
//   node .cdp/subjective-scan.mjs
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
  const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(()=>({}));
  const G=(x)=>fetch(x,{headers:{Authorization:t}}).then(r=>r.json()).catch(()=>({}));
  const cs=await fetch('/gateway/frequent/orgStudent/pagedMyCourse',{method:'POST',headers:H,body:JSON.stringify({filters:{courseNature:null,name:'',schoolYear:'',studentId:me.id,term:'',courseFlag:0},pageIndex:1,pageSize:50})}).then(r=>r.json());
  const recs=(cs.data&&(cs.data.records||cs.data.list))||[];
  const out=[];
  for(const c of recs){
    const sid=c.studentCourseId||c.id, ver=c.version||'BK_RJGC_2024';
    // 取单元：闯关制 + 非闯关制兜底
    let units=[];
    const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId='+c.id+'&majorId='+me.majorId+'&userId='+me.id+'&version='+ver+'&studentCourseId='+sid);
    for(const b of bs.data||[]){const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId='+sid);
      for(const n of ns.data||[]) if(n.videoId&&!units.some(x=>x.unitId===n.id)) units.push({unitId:n.id,name:n.catalogName});}
    if(!units.length){
      const tr=await P('courseCatalog/tree',{courseId:c.id});
      const walk=(n)=>{ for(const x of (n.childList||[])){ if((x.videoCount||0)>0&&!units.some(u=>u.unitId===x.id)) units.push({unitId:x.id,name:x.name||x.sortName}); walk(x); } };
      walk(tr.data||{});
    }
    const rows=[];
    for(const u of units){
      await P('studyRecordExercises/exerciseBarrier',{studentCourseId:sid,unitId:u.unitId});
      const l=await P('studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:c.id,majorId:me.majorId,unitId:u.unitId,version:ver});
      for(const q of (Array.isArray(l.data)?l.data:[])){
        if(q.questionType!==5&&q.questionType!==6&&q.questionType!==8) continue;
        if(q.submitAnswer&&q.submitAnswer!=='[]'&&String(q.submitAnswer).trim()) continue; // 已作答
        const ref=String(q.referenceAnswer||'');
        const refText=ref.replace(/<[^>]+>/g,'').trim();
        const hasImg=/<img/i.test(ref);
        rows.push({unit:u.name,type:q.questionType,qid:q.id,
          refLen:refText.length,hasImg,
          // 平台给的是"真答案"还是"见视频/讲义"这类占位话术
          placeholder:/见学习视频|见视频和讲义|具体内容请见|略$/.test(refText)&&refText.length<60});
      }
      await P('studyRecordExercises/clearStudentUnit',{studentCourseId:sid,unitId:u.unitId});
    }
    const cnt=(f)=>rows.filter(f).length;
    out.push({course:c.name,total:rows.length,
      t5:cnt(r=>r.type===5),t6:cnt(r=>r.type===6),t8:cnt(r=>r.type===8),
      withRef:cnt(r=>r.refLen>=20&&!r.placeholder),
      needGen:cnt(r=>r.refLen<20||r.placeholder),
      withImg:cnt(r=>r.hasImg)});
  }
  return JSON.stringify(out)
})()`;

const rows = JSON.parse(await evl(expr));
console.log('主观题（未作答）分布：\n');
console.log('课程'.padEnd(24) + '合计  简答 问答 设计 | 平台有真答案 | 需生成 | 含图片');
let T = { total: 0, withRef: 0, needGen: 0, withImg: 0 };
for (const r of rows) {
  console.log(`${String(r.course).padEnd(22)} ${String(r.total).padStart(4)} ${String(r.t5).padStart(5)} ${String(r.t6).padStart(4)} ${String(r.t8).padStart(4)} | ${String(r.withRef).padStart(9)} | ${String(r.needGen).padStart(6)} | ${String(r.withImg).padStart(6)}`);
  T.total += r.total; T.withRef += r.withRef; T.needGen += r.needGen; T.withImg += r.withImg;
}
console.log(`\n合计 ${T.total} 道未作答主观题：平台已给可搬运答案 ${T.withRef} 道，需要生成 ${T.needGen} 道，含图片 ${T.withImg} 道`);
ws.close(); process.exit(0);
