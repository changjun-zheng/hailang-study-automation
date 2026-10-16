// 只读：① 用抓到的真实参数重放 exercisesList，确认能拿到题；② 找 segmentKnowledgeId 在
// progressDetails 里的出处（怀疑是视频的 courseCatalogVideoSegments），把枚举链路补齐。
//   node .cdp/kn-replay.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const SEG = '7c95f99852bad83f3e3e1d6d39153cde';
const UNIT = '6814946beba252b0ae35bf229d454ae7';
const VID = '3159e08af4683e6e8736a9015ebcae9e';
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';

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
  const r={};
  const ch=await P('studyKnowledgeExerciseRecord/check',{segmentKnowledgeId:'${SEG}',studentCourseId:'${SC}',studentId:me.studyNumber||me.id,videoId:'${VID}'});
  r.check={code:ch.code,msg:String(ch.msg||'').slice(0,30),data:JSON.stringify(ch.data).slice(0,120)};
  const l=await P('studyKnowledgeExerciseRecord/exercisesList',{knowledgeNodeId:'${SEG}',studentCourseId:'${SC}',unitId:'${UNIT}'});
  const qs=Array.isArray(l.data)?l.data:[];
  r.list={code:l.code,msg:String(l.msg||'').slice(0,30),n:qs.length,
    keys:qs.length?Object.keys(qs[0]).slice(0,16):[],
    sample:qs.slice(0,3).map(q=>({type:q.questionType,answered:!!q.submitAnswer,ref:String(q.referenceAnswer||'').slice(0,20),opts:(q.optionVos||[]).length}))};
  // 找 segmentKnowledgeId 的出处
  const pd=await (await fetch('/gateway/system/orgStudent/progressDetails?studentId='+(me.studyNumber||me.id)+'&id=${CID}&majorId=${MID}&studentCourseId=${SC}&version=BK_RJGC_2024',{headers:{Authorization:t}})).json();
  let where=null, segShape=null, segTotal=0;
  const walk=(n)=>{ if(!n||typeof n!=='object')return;
    for(const k of Object.keys(n)){ const v=n[k];
      if(Array.isArray(v)&&/segment/i.test(k)){ segTotal+=v.length;
        if(v.some(x=>x&&x.id==='${SEG}')){ where=k; segShape=Object.keys(v[0]||{}).slice(0,14); } } }
    for(const c of (n.children||[])) walk(c); for(const c of (n.courseCatalogVideoVos||[])) walk(c);
  };
  walk({children:Array.isArray(pd.data)?pd.data:[]});
  r.segment={where:where||'(未在 progressDetails 中找到该 id)',segArrayTotal:segTotal,keys:segShape};
  return JSON.stringify(r)
})()`;

const o = JSON.parse(await evl(expr));
console.log('① check 接口:', JSON.stringify(o.check));
console.log('② exercisesList:', JSON.stringify(o.list, null, 1).slice(0, 900));
console.log('③ segmentKnowledgeId 出处:', JSON.stringify(o.segment));
ws.close(); process.exit(0);
