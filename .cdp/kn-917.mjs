// 只读：定位软系分知识练习层那道被 917 锁住的题，并把服务端为它返回的全部字段打出来，
// 找有没有 recordId / 版本戳一类字段可以像编程题那样「带上旧记录重写」。
//   node .cdp/kn-917.mjs [课程名子串]
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const COURSE = process.argv[2] || '软件系统分析与设计';

const EXPR = `(async()=>{
  const t=localStorage.getItem('token2');if(!t) return JSON.stringify({err:'no-token'})
  const H={Authorization:t,'Content-Type':'application/json'};
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(e=>({code:-1,msg:String(e)}));
  const cs=await fetch('/gateway/frequent/orgStudent/pagedMyCourse',{method:'POST',headers:H,body:JSON.stringify({filters:{courseNature:null,name:'',schoolYear:'',studentId:String(me.id),term:'',courseFlag:0},pageIndex:1,pageSize:50})}).then(r=>r.json()).catch(e=>({code:-1}));
  const cl=(cs.data&&(cs.data.records||cs.data.list))||[];
  const c=cl.find(x=>String(x.name||'').includes(${JSON.stringify(COURSE)}));
  if(!c) return JSON.stringify({err:'no-course',n:cl.length,raw:String(JSON.stringify(cs)).slice(0,120)})
  const sid=c.studentCourseId||c.id, ver=c.version||'BK_RJGC_2024';
  const pd=await fetch('/gateway/system/orgStudent/progressDetails?studentId='+(me.studyNumber||me.id)+'&id='+c.id+'&majorId='+me.majorId+'&studentCourseId='+sid+'&version='+ver,{headers:{Authorization:t}}).then(r=>r.json()).catch(e=>({code:-1}));
  const segs=[];
  const walk=(n,parent)=>{ if(!n||typeof n!=='object')return;
    for(const [k,v] of Object.entries(n)){
      if(Array.isArray(v)&&/KnowledgeTimeRanges/.test(k)&&!/Vos$/.test(k))
        for(const s of v) if(s&&s.id) segs.push({segId:s.id,segName:s.name||s.knowledgeName||'',unitId:(parent&&parent.unitId)||'',videoId:(parent&&(parent.videoId||parent.id))||''});
      if(Array.isArray(v)) for(const it of v) if(it&&typeof it==='object') walk(it,it);
      else if(v&&typeof v==='object') walk(v,parent);
    }
  };
  walk({children:Array.isArray(pd.data)?pd.data:[]},null);
  const uniq=[...new Map(segs.map(s=>[s.segId,s])).values()].filter(s=>s.unitId&&s.videoId);
  const norm=(v)=>String(v||'').split(/[|,]/).map(s=>s.trim()).filter(Boolean).sort().join(',');
  const hits=[]; const checkRaw=[];
  for(const s of uniq){
    const ck=await P('studyKnowledgeExerciseRecord/check',{segmentKnowledgeId:s.segId,studentCourseId:sid,studentId:me.studyNumber||me.id,videoId:s.videoId});
    const l=await P('studyKnowledgeExerciseRecord/exercisesList',{knowledgeNodeId:s.segId,studentCourseId:sid,unitId:s.unitId});
    const qs=Array.isArray(l.data)?l.data:[];
    for(const q of qs){
      const right=(q.optionVos||[]).filter(o=>o.answerFlag===1).map(o=>o.id);
      let ok=false;
      if(q.questionType===1) ok=right.length===1&&norm(right)===norm(q.referenceAnswer);
      else if(q.questionType===2) ok=right.length>1&&norm(right)===norm(q.referenceAnswer);
      else if(q.questionType===3) ok=/^[01]$/.test(String(q.referenceAnswer==null?'':q.referenceAnswer).trim());
      if(!q.submitAnswer&&ok) hits.push({seg:s.segName,segId:s.segId,unitId:s.unitId,videoId:s.videoId,q});
    }
    if(ck&&ck.code!==200) checkRaw.push({seg:s.segName,code:ck.code,msg:String(ck.msg||'').slice(0,60)});
  }
  return JSON.stringify({course:c.name,segCount:uniq.length,hits,checkRaw})
})()`;

const ts = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('study.cqie.edu.cn'));
const race = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
let out = null;
for (const t of ts) {
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  if (!(await race(new Promise((r) => { ws.onopen = () => r(true); ws.onerror = () => r(false); }), 4000))) continue;
  const r = await race(new Promise((res) => {
    ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id === 1) res(x.result); };
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: EXPR, returnByValue: true, awaitPromise: true } }));
  }), 180000);
  ws.close();
  if (!r || !r.result || r.result.value === undefined) {
    const why = r && r.result && r.result.subtype === 'error' ? '页面抛错：' + String(r.result.className) + ' ' + String(r.result.description || '').slice(0, 200)
      : r && r.exceptionDetails ? 'exceptionDetails：' + String(JSON.stringify(r.exceptionDetails).slice(0, 240)) : (r ? '无 value：' + String(JSON.stringify(r).slice(0, 200)) : '超时未返回');
    console.log(`  标签页失败 ${t.url.slice(0, 50)} -> ${why}`); continue;
  }
  let v = null; try { v = JSON.parse(r.result.value); } catch { console.log('  返回非 JSON：' + String(r.result.value).slice(0, 150)); continue; }
  if (v.err) { console.log(`  该标签页拉不到数据（${JSON.stringify(v)}），换下一个`); continue; }
  out = v; break;
}
if (!out) { console.error('所有标签页都失败'); process.exit(1); }

console.log(`课程「${out.course}」分段知识点 ${out.segCount} 个；未答且答案可核验的题 ${out.hits.length} 道`);
if (out.checkRaw.length) console.log(`check 接口非 200 的分段：${JSON.stringify(out.checkRaw)}`);
for (const h of out.hits) {
  console.log(`\n===== 分段「${String(h.seg).slice(0, 20)}」 segId=${String(h.segId).slice(0, 12)} 题目 qid=${String(h.q.id).slice(0, 12)} 题型=${h.q.questionType}`);
  for (const [k, v] of Object.entries(h.q)) {
    if (['content', 'referenceAnswer', 'scoreCriteria', 'optionVos'].includes(k)) { console.log(`  ${k} = <${typeof v === 'object' ? (v || []).length + ' 项' : String(v).length + ' 字'}>`); continue; }
    console.log(`  ${k} = ${v === null || v === '' ? '-' : String(v).slice(0, 60)}`);
  }
}
process.exit(0);
