// 只读：把某门课里设计题（questionType=8）的服务端原始字段打出来，判断"答案"到底是
// 文字 HTML、图片 URL，还是要学生上传文件（submitFile）。这决定 25 道设计题怎么交。
//   node .cdp/type8-shape.mjs 框架程序设计
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const KEY = process.argv[2] || '框架程序设计';

const all = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && t.url.includes('study.cqie.edu.cn'));
let KEEP = null; try { KEEP = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id; } catch {}
const full = all.find((t) => t.id === KEEP) || all[0];
const ws = new WebSocket(full.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', String(r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

const KEY_J = JSON.stringify(KEY);
const expr = `(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(()=>({}));
  const G=(x)=>fetch(x,{headers:{Authorization:t}}).then(r=>r.json()).catch(()=>({}));
  const cs=await fetch('/gateway/frequent/orgStudent/pagedMyCourse',{method:'POST',headers:H,body:JSON.stringify({filters:{courseNature:null,name:'',schoolYear:'',studentId:me.id,term:'',courseFlag:0},pageIndex:1,pageSize:50})}).then(r=>r.json());
  const recs=(cs.data&&(cs.data.records||cs.data.list))||[];
  const cc=recs.find(x=>String(x.name||'').includes(${KEY_J}));
  if(!cc) return JSON.stringify([{err:'没这门课，可选：'+recs.map(x=>x.name).join(' / ')}]);
  const CID=cc.id, SC=cc.studentCourseId||cc.id, VER=cc.version||'BK_RJGC_2024';
  let units=[];
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId='+CID+'&majorId='+me.majorId+'&userId='+me.id+'&version='+VER+'&studentCourseId='+SC);
  for(const b of bs.data||[]){const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId='+SC);
    for(const n of ns.data||[]) if(n.videoId&&!units.some(x=>x.unitId===n.id)) units.push({unitId:n.id,name:n.catalogName});}
  if(!units.length){
    const tr=await P('courseCatalog/tree',{courseId:CID});
    const walk=(n)=>{ for(const x of (n.childList||[])){ if((x.videoCount||0)>0&&!units.some(u=>u.unitId===x.id)) units.push({unitId:x.id,name:x.name||x.sortName}); walk(x); } };
    walk(tr.data||{});
  }
  const found=[];
  for(const u of units){
    if(found.length>=2) break;
    await P('studyRecordExercises/exerciseBarrier',{studentCourseId:SC,unitId:u.unitId});
    const l=await P('studyRecordExercises/exercisesList',{studentCourseId:SC,courseId:CID,majorId:me.majorId,unitId:u.unitId,version:VER});
    for(const q of (Array.isArray(l.data)?l.data:[])) if(q.questionType===8&&found.length<2) found.push({unit:u.name,q});
    await P('studyRecordExercises/clearStudentUnit',{studentCourseId:SC,unitId:u.unitId});
  }
  return JSON.stringify({course:cc.name,units:units.length,found:found.map(f=>({unit:f.unit,
    nonNullKeys:Object.keys(f.q).filter(k=>f.q[k]!==null&&f.q[k]!==undefined&&f.q[k]!==''),
    content:String(f.q.content||'').replace(/<[^>]+>/g,'').trim().slice(0,200),
    refRaw:String(f.q.referenceAnswer||'').slice(0,600),
    refImgs:(String(f.q.referenceAnswer||'').match(/src="[^"]{0,140}/g)||[]).slice(0,3),
    scoreCriteria:String(f.q.scoreCriteria||'').replace(/<[^>]+>/g,'').trim().slice(0,200),
    submitAnswer:JSON.stringify(f.q.submitAnswer),submitFile:String(f.q.submitFile||''),
    baseFileName:String(f.q.baseFileName||''),languageName:String(f.q.languageName||''),
    options:(f.q.optionVos||[]).length,qid:f.q.id}))})
})()`;

const o = JSON.parse(await evl(expr));
if (o.found && o.found.err) { console.log(o.found.err); ws.close(); process.exit(1); }
console.log(`课程「${o.course}」 单元 ${o.units} 个，取到设计题 ${o.found.length} 道`);
for (const r of o.found) {
  console.log('='.repeat(72));
  console.log(`单元「${r.unit}」 qid=${String(r.qid).slice(0, 12)} 选项数=${r.options} submitAnswer=${r.submitAnswer} submitFile=${r.submitFile || '(空)'} baseFileName=${r.baseFileName || '(空)'} language=${r.languageName || '(空)'}`);
  console.log(`题干: ${r.content}`);
  console.log(`评分标准: ${r.scoreCriteria || '(无)'}`);
  console.log(`非空字段: ${r.nonNullKeys.join(', ')}`);
  console.log(`referenceAnswer 原文前 600 字:\n${r.refRaw}`);
  if (r.refImgs.length) console.log(`内含图片 src: ${JSON.stringify(r.refImgs)}`);
}
ws.close(); process.exit(0);
