// 只读：把前端框架课里每道编程题（type 7）的服务端原始字段整份拉出来对比，
// 找出「写入回 200 但 submitFile 不生效」那两道与成功题之间到底哪几个字段不同。
//   node .cdp/codeq-diff.mjs
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const COURSE = '前端框架开发技术';

const all = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('study.cqie.edu.cn'));
if (!all.length) { console.error('没有 study 标签页'); process.exit(1); }
// 被 Chrome 挂起的标签页上 fetch 会静默失败，拿到空课程列表 —— 逐个试，谁真能拉到接口用谁
const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
let ws = null;
for (const t of all) {
  const cand = new WebSocket(t.webSocketDebuggerUrl);
  const ok = await withTimeout(new Promise((r) => { cand.onopen = () => r(true); cand.onerror = () => r(false); }), 4000);
  if (!ok) { console.log(`  跳过连不上的标签页 ${t.url.slice(0, 60)}`); continue; }
  await new Promise((res) => {
    cand.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id === 99) res(true); };
    cand.send(JSON.stringify({ id: 99, method: 'Runtime.evaluate', params: { expression: `JSON.stringify({n:(JSON.parse(localStorage.getItem('userInfo2')||'{}').id||'').length})`, returnByValue: true } }));
  });
  ws = cand;
  console.log(`  用标签页 ${t.url.slice(0, 70)}`);
  break;
}
if (!ws) { console.error('所有 study 标签页都连不上'); process.exit(1); }
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', String(r.exceptionDetails.exception?.description || '').slice(0, 300)); process.exit(1); } return r.result?.value; };

const out = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const P=(x,b)=>fetch(x[0]==='/'?x:'/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(e=>({code:-1,msg:String(e)}));
  const G=(x)=>fetch(x,{headers:H}).then(r=>r.json()).catch(e=>({code:-1,msg:String(e)}));
  const cs=await P('/gateway/frequent/orgStudent/pagedMyCourse',{filters:{courseNature:null,name:'',schoolYear:'',studentId:String(me.id),term:'',courseFlag:0},pageIndex:1,pageSize:50});
  const cl=(cs.data&&(cs.data.records||cs.data.list))||[];
  const c=cl.find(x=>(x.name||'').includes(${JSON.stringify(COURSE)}));
  const sid=c.studentCourseId||c.id;
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId='+c.id+'&majorId='+me.majorId+'&userId='+me.id+'&version='+c.version+'&studentCourseId='+sid);
  const units=[];
  for(const b of (bs.data||[])){const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId='+sid);
    for(const n of ns.data||[]) if(n.videoId&&!units.some(x=>x.unitId===n.id)) units.push({unitId:n.id,name:n.catalogName});}
  const rows=[];
  for(const s of units){
    await P('studyRecordExercises/exerciseBarrier',{studentCourseId:sid,unitId:s.unitId});
    const l=await P('studyRecordExercises/exercisesList',{studentCourseId:sid,courseId:c.id,majorId:me.majorId,unitId:s.unitId,version:c.version});
    const all=Array.isArray(l.data)?l.data:[];
    for(const q of all) if(q.questionType===7) rows.push({unit:s.name,unitId:s.unitId,unitTotal:all.length,q});
    await P('studyRecordExercises/clearStudentUnit',{studentCourseId:sid,unitId:s.unitId});
  }
  return JSON.stringify({course:c.name,rows})
})()`));

// 大字段只留长度，别把题库答案打到终端上
const BIG = new Set(['content', 'referenceAnswer', 'scoreCriteria', 'analysis', 'optionVos']);
const keys = new Set();
for (const r of out.rows) Object.keys(r.q).forEach((k) => keys.add(k));
console.log(`课程「${out.course}」编程题 ${out.rows.length} 道，服务端返回的字段共 ${keys.size} 个：`);
console.log([...keys].join(' | ') + '\n');
console.log('单元题数 | 单元/题目 | 已答(submitFile) | 关键字段值');
for (const r of out.rows) {
  const brief = [...keys].filter((k) => !BIG.has(k) && !['id', 'questionType'].includes(k))
    .map((k) => { const v = r.q[k]; return `${k}=${v === null || v === '' ? '-' : String(v).slice(0, 26)}`; });
  const big = [...BIG].map((k) => `${k}:${r.q[k] ? String(r.q[k]).length : 0}`).join(' ');
  console.log(`\n[${r.unitTotal}题] ${r.unit} / ${String(r.q.questionName || r.q.name || r.q.qid || '').slice(0, 24)}`);
  console.log('   ' + brief.join('  '));
  console.log('   ' + big);
}
ws.close(); process.exit(0);
