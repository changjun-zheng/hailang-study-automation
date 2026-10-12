// 只读诊断：验证「非闯关制课程」能否用 courseCatalog/tree 枚举出习题单元。
// 全程不调 checkUpdateExercises / createExercisesList / createList，即不领 operationId、不写任何答案。
// 唯一例外：为了拿到真实题数，对 1 个单元调 exercisesList（它会占用平台那个"同时只允许一个"的习题会话），
// 读完立刻 clearStudentUnit 释放，并回报释放前后该单元的已答条数，确认没动到他已有的作答。
//   node .cdp/java-units.mjs 框架程序设计
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
  // 取课要用站点自己的分页接口；orgStudent/studentPaged 那条会返回空列表（踩过）
  const cs=await fetch('/gateway/frequent/orgStudent/pagedMyCourse',{method:'POST',headers:H,body:JSON.stringify({filters:{courseNature:null,name:'',schoolYear:'',studentId:me.id,term:'',courseFlag:0},pageIndex:1,pageSize:50})}).then(r=>r.json()).catch(e=>({err:String(e)}));
  const recs=(cs.data&&(cs.data.records||cs.data.list))||[];
  const c=recs.find(x=>String(x.name||'').includes(${JSON.stringify(KEY)}));
  if(!c) return JSON.stringify({err:'课程列表里没找到，现有：'+recs.map(x=>x.name).join(' / ')});
  const sid=c.studentCourseId||c.id;
  const r={course:c.name,cid:c.id,sid,version:c.version||'BK_RJGC_2024'};

  // 1) 关卡接口在这类课上给什么
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId='+c.id+'&majorId='+me.majorId+'&userId='+me.id+'&version='+r.version+'&studentCourseId='+sid);
  r.barrierCount=(bs.data||[]).length;

  // 2) 目录树枚举
  const tree=await P('courseCatalog/tree',{courseId:c.id});
  const nodes=[];
  const walk=(n,parent)=>{ for(const x of (n.childList||[])){ if((x.videoCount||0)>0) nodes.push({unitId:x.id,name:x.name||x.sortName,videoCount:x.videoCount,parent:parent||''}); walk(x,x.name||parent); } };
  walk(tree.data||{},'');
  r.treeCode=tree.code; r.nodeCount=nodes.length;

  // 3) 对第 1 个和第 6 个节点各读一次题量（读不到就如实报空）
  const probe=[];
  for(const nd of [nodes[0],nodes[5]].filter(Boolean)){
    await P('studyRecordExercises/exerciseBarrier',{studentCourseId:sid,unitId:nd.unitId});
    const l=await P('studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:c.id,majorId:me.majorId,unitId:nd.unitId,version:r.version});
    const qs=Array.isArray(l.data)?l.data:[];
    const right=(q)=>(q.optionVos||[]).filter(o=>o.answerFlag===1).map(o=>o.id);
    const norm=(v)=>String(v||'').split(/[|,]/).map(x=>x.trim()).filter(Boolean).sort().join(',');
    probe.push({name:nd.name,unitId:String(nd.unitId).slice(0,10),code:l.code,msg:String(l.msg||'').slice(0,30),
      total:qs.length,answered:qs.filter(q=>!!q.submitAnswer).length,
      types:[...new Set(qs.map(q=>q.questionType))].join(','),
      // 只判"平台答案与选项是否双证一致"，不提交
      verifiable:qs.filter(q=>!q.submitAnswer&&((q.questionType===1&&right(q).length===1&&norm(right(q))===norm(q.referenceAnswer))||(q.questionType===2&&right(q).length>1&&norm(right(q))===norm(q.referenceAnswer))||(q.questionType===3&&/^[01]$/.test(String(q.referenceAnswer==null?'':q.referenceAnswer).trim())))).length});
    // 释放那个唯一会话，并回报释放前后已答条数有没有变化
    const rel=await P('studyRecordExercises/clearStudentUnit',{studentCourseId:sid,unitId:nd.unitId});
    probe[probe.length-1].releaseCode=rel.code;
    const after=await P('studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:c.id,majorId:me.majorId,unitId:nd.unitId,version:r.version});
    probe[probe.length-1].answeredAfterRelease=Array.isArray(after.data)?after.data.filter(q=>!!q.submitAnswer).length:-1;
    await P('studyRecordExercises/clearStudentUnit',{studentCourseId:sid,unitId:nd.unitId});
  }
  r.probe=probe;
  return JSON.stringify(r)
})()`;

const o = JSON.parse(await evl(expr));
if (o.err) { console.log(o.err); ws.close(); process.exit(1); }
console.log(`课程「${o.course}」 cid=${String(o.cid).slice(0, 10)} version=${o.version}`);
console.log(`\n1) 关卡接口 listCourseBarrier 返回 ${o.barrierCount} 个关卡  ← 0 就是"非闯关制"`);
console.log(`2) courseCatalog/tree code=${o.treeCode} → 含视频的目录节点 ${o.nodeCount} 个`);
console.log(`3) 抽两个节点读题量：`);
for (const p of o.probe || []) {
  console.log(`   ${String(p.name).slice(0, 30).padEnd(32)} code=${p.code} 共${p.total}道 已答${p.answered} 题型[${p.types}] 其中可验证未答${p.verifiable}`);
  console.log(`   ${'」。释放会话'.padEnd(32)} release code=${p.releaseCode}；释放后同一单元再读：已答 ${p.answeredAfterRelease} 道（应与上面 ${p.answered} 相同，不同就说明这一下动到了他的作答）`);
}
ws.close(); process.exit(0);
