// 只读盘点「知识练习」层：枚举路径是 课程 → 单元 → 视频 → 视频分段 → videoSegmentKnowledgeTimeRanges[].id
// 上一版按"数组名里含 segment"过滤，正好漏掉这个字段（它叫 videoSegmentKnowledgeTimeRanges），
// 所以 120 次调用全空。真实参数名是从站点自己的请求里抓到的：knowledgeNodeId=分段知识点id。
//   node .cdp/kn-inventory2.mjs <课程名关键词>
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.argv[2] || '前端框架开发技术';
const LIMIT = Number(process.argv[3] || 0); // 只读探量时可限制调用次数
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
  const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(e=>({err:String(e)}));
  const cs=await fetch('/gateway/frequent/orgStudent/pagedMyCourse',{method:'POST',headers:H,body:JSON.stringify({filters:{courseNature:null,name:'',schoolYear:'',studentId:me.id,term:'',courseFlag:0},pageIndex:1,pageSize:50})}).then(r=>r.json());
  const c=((cs.data&&(cs.data.records||cs.data.list))||[]).find(x=>String(x.name||'').includes(${JSON.stringify(KEY)}));
  if(!c) return JSON.stringify({err:'没这门课'});
  const sid=c.studentCourseId||c.id;
  const pdResp=await fetch('/gateway/system/orgStudent/progressDetails?studentId='+(me.studyNumber||me.id)+'&id='+c.id+'&majorId='+me.majorId+'&studentCourseId='+sid+'&version='+(c.version||'BK_RJGC_2024'),{headers:{Authorization:t}});
  const pd=await pdResp.json();
  // 收集分段知识点：任意层级里名为 videoSegmentKnowledgeTimeRanges(Vos) 的数组
  const segs=[];
  const walk=(n,parent)=>{ if(!n||typeof n!=='object')return;
    for(const [k,v] of Object.entries(n)){
      if(Array.isArray(v)&&/KnowledgeTimeRanges/.test(k)&&!/Vos$/.test(k)){
        for(const s of v) if(s&&s.id) segs.push({segId:s.id,unitId:(parent&&parent.unitId)||'',videoId:(parent&&(parent.videoId||parent.id))||'',segName:s.name||s.knowledgeName||''});
      }
      if(Array.isArray(v)) for(const it of v) if(it&&typeof it==='object') walk(it,it);
      else if(v&&typeof v==='object') walk(v,parent);
    }
  };
  walk({children:Array.isArray(pd.data)?pd.data:[]},null);
  const uniq=[...new Map(segs.map(s=>[s.segId,s])).values()];
  const norm=(v)=>String(v||'').split(/[|,]/).map(s=>s.trim()).filter(Boolean).sort().join(',');
  const rows=[]; let calls=0,empty=0;
  const LIM=${JSON.stringify(LIMIT)};
  const list=LIM&&uniq.length>LIM?uniq.slice(0,LIM):uniq;
  for(const s of list){
    if(!s.unitId) { empty++; continue; }
    const l=await P('studyKnowledgeExerciseRecord/exercisesList',{knowledgeNodeId:s.segId,studentCourseId:sid,unitId:s.unitId});
    calls++;
    const qs=Array.isArray(l.data)?l.data:[];
    if(!qs.length) continue;
    let can=0; const types={};
    for(const q of qs){
      const right=(q.optionVos||[]).filter(o=>o.answerFlag===1).map(o=>o.id);
      let ok=false;
      if(q.questionType===1) ok=right.length===1&&norm(right)===norm(q.referenceAnswer);
      else if(q.questionType===2) ok=right.length>1&&norm(right)===norm(q.referenceAnswer);
      else if(q.questionType===3) ok=/^[01]$/.test(String(q.referenceAnswer==null?'':q.referenceAnswer).trim());
      if(ok&&!q.submitAnswer) can++;
      const kk=q.questionType+'='+(q.questionTypeName||'题型'+q.questionType); types[kk]=(types[kk]||0)+1;
    }
    rows.push({seg:s.segName||String(s.segId).slice(0,8),unit:String(s.unitId).slice(0,8),total:qs.length,answered:qs.filter(q=>!!q.submitAnswer).length,can,types:Object.entries(types).map(([a,b])=>a+':'+b).join(' ')});
  }
  const sum=(k)=>rows.reduce((a,r)=>a+r[k],0);
  return JSON.stringify({course:c.name,segTotal:segs.length,segUniq:uniq.length,probed:list.length,calls,empty,
    total:sum('total'),answered:sum('answered'),can:sum('can'),rows:rows.slice(0,12)})
})()`;

const o = JSON.parse(await evl(expr));
if (o.err) { console.log(o.err); ws.close(); process.exit(1); }
console.log(`课程「${o.course}」 分段知识点：原始 ${o.segTotal} 个 / 去重 ${o.segUniq} 个，本次探测 ${o.probed}（无 unitId 跳过 ${o.empty}，实际调用 ${o.calls}）`);
console.log(`知识练习：${o.total} 道，已答 ${o.answered}，可自动作答 ${o.can}，需生成 ${o.total - o.answered - o.can}`);
console.log('有题的分段（前 12 个）：');
for (const r of o.rows) console.log(`  ${String(r.seg).slice(0, 18).padEnd(20)} 单元${r.unit} 题${r.total} 已答${r.answered} 可做${r.can}  ${r.types}`);
if (!o.rows.length) console.log(`  （探测的 ${o.probed} 个分段都没返回题目 —— unitId 层级可能仍取错，需按真实父节点重取）`);
ws.close(); process.exit(0);
