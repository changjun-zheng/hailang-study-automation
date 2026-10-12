// 只读：逐门课调 myCourseDetails，比对 haveTime/sumTime 与 haveUnit/sumUnit。
// learned 那个百分比会把"差一个单元"显示成 100.00%，所以不能拿它当完成判据。
//   node .cdp/course-times.mjs
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

const o = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const cs=await fetch('/gateway/frequent/orgStudent/pagedMyCourse',{method:'POST',headers:H,body:JSON.stringify({filters:{courseNature:null,name:'',schoolYear:'',studentId:me.id,term:'',courseFlag:0},pageIndex:1,pageSize:50})}).then(r=>r.json());
  const recs=(cs.data&&(cs.data.records||cs.data.list))||[];
  const out=[];
  for(const c of recs){
    const sid=c.studentCourseId||c.id;
    const d=await fetch('/gateway/system/orgStudent/myCourseDetails?studentId='+(me.studyNumber||me.id)+'&id='+c.id+'&majorId='+me.majorId+'&studentCourseId='+sid+'&version='+(c.version||'BK_RJGC_2024'),{headers:{Authorization:t}}).then(r=>r.json()).catch(e=>({err:String(e)}));
    const x=d.data||{};
    // 再取权威树里"有视频但服务端没记为完成"的条数，看缺的是不是课程介绍
    const tr=await fetch('/gateway/study/courseCatalog/tree',{method:'POST',headers:H,body:JSON.stringify({courseId:c.id})}).then(r=>r.json()).catch(()=>({}));
    const pd=await fetch('/gateway/system/orgStudent/progressDetails?studentId='+(me.studyNumber||me.id)+'&id='+c.id+'&majorId='+me.majorId+'&studentCourseId='+sid+'&version='+(c.version||'BK_RJGC_2024'),{headers:{Authorization:t}}).then(r=>r.json()).catch(()=>({}));
    const pend=[];
    // 这一列曾经用错字段：progressDetails 的视频对象里没有 studyVideoStatus，
    // 拿它 !==2 过滤会把全部视频都当成未完成（对照课 08:20:21/08:20:21 已记满却报 41 条未完成）。
    // 改用这个结构里真有的 haveTime / timeLength：haveTime 追平片长才算记完。
    const walk=(n)=>{ for(const v of (n.courseCatalogVideoVos||[])) { const len=Number(v.timeLength)||0; const have=Number(v.haveTime)||0; if(len>0&&have<len-2) pend.push({name:v.name,len,have,barrier:n.name}); } for(const ch of (n.children||[])) walk(ch); };
    (Array.isArray(pd.data)?pd.data:[]).forEach(walk);
    out.push({name:c.name,learned:c.learned,haveUnit:x.haveUnit,sumUnit:x.sumUnit,haveTime:x.haveTime,sumTime:x.sumTime,
      haveEx:x.haveExercises,sumEx:x.sumExercises,treeVids:(tr.data&&(tr.data.videoCount||0))||null,pending:pend});
  }
  return JSON.stringify(out)
})()`));

for (const r of o) {
  const sec = (t) => String(t || '0:0:0').split(':').reduce((a, p) => a * 60 + (parseInt(p, 10) || 0), 0);
  const gap = sec(r.sumTime) - sec(r.haveTime);
  console.log(`\n【${r.name}】 时长 ${r.haveTime}/${r.sumTime}  缺口 ${gap}s  |  单元 ${r.haveUnit}/${r.sumUnit}  learned=${r.learned}`);
  // 不列"哪些视频未完成"：progressDetails 的视频对象不带学生状态
  // （studyVideoStatus 根本不存在；haveTime 恒为 0 —— 拿对照课 08:20:21/08:20:21 一试就露馅），
  // 逐条状态只在 listCatalogBarrier 有，而它恰好漏掉"课程介绍"那类顶层关卡。
  if (gap > 0) console.log(`   缺口 ${gap}s 若等于某个顶层「课程介绍」的片长，就是关卡接口漏枚举的那条`);
  if (r.learned === '100.00%' && gap > 0) console.log('   ! learned 显示 100.00% 但时长没记满 —— 百分比不能当完成判据');
}
ws.close(); process.exit(0);
