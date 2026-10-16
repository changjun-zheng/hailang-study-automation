// 只读：定位 segmentKnowledgeId 在 progressDetails 分段数组里的字段名，
// 并给出「课程 → 单元 → 视频 → 分段 → 习题」的可枚举路径与总量。
//   node .cdp/kn-source.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const SEG = '7c95f99852bad83f3e3e1d6d39153cde';
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
  const t=localStorage.getItem('token2');
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const pd=await (await fetch('/gateway/system/orgStudent/progressDetails?studentId='+(me.studyNumber||me.id)+'&id=${CID}&majorId=${MID}&studentCourseId=${SC}&version=BK_RJGC_2024',{headers:{Authorization:t}})).json();
  const hits=[]; const arrays={};
  const walk=(n,trail)=>{ if(!n||typeof n!=='object')return;
    if(Array.isArray(n)){ for(const it of n){ if(it&&typeof it==='object'){
      for(const [k,v] of Object.entries(it)) if(v==='${SEG}') hits.push({trail,key:k});
    } } return; }
    for(const [k,v] of Object.entries(n)){
      if(Array.isArray(v)&&/segment/i.test(k)) arrays[k]=(arrays[k]||0)+v.length;
      walk(v,trail+'.'+k);
    }
  };
  walk(pd.data,'root');
  // 取一个分段对象看字段
  let one=null; const w2=(n)=>{ if(one||!n||typeof n!=='object')return;
    for(const [k,v] of Object.entries(n)) if(Array.isArray(v)&&/segment/i.test(k)&&v.length){ one={arrKey:k,item:v[0]}; return; }
    for(const v of Object.values(n)) w2(v); };
  w2(pd.data);
  // 统计：全课程有多少分段、多少带练习
  let segCount=0; const segIds=[];
  const w3=(n)=>{ if(!n||typeof n!=='object')return;
    for(const [k,v] of Object.entries(n)) if(Array.isArray(v)&&/segment/i.test(k)) for(const s of v){ segCount++; const id=s.id||s.knowledgeId||s.businessId||s.segmentId; if(id) segIds.push(id); }
    for(const v of Object.values(n)) w3(v); };
  w3(pd.data);
  return JSON.stringify({hits:hits.slice(0,4),arrays,segCount,uniqSeg:[...new Set(segIds)].length,
    oneKeys:one?Object.entries(one.item).filter(([k,v])=>v!==null&&v!=='').map(([k,v])=>k+'='+(typeof v==='object'?JSON.stringify(v).slice(0,30):String(v).slice(0,30))).slice(0,14):null})
})()`;

const o = JSON.parse(await evl(expr));
console.log(`那个分段 id 出现在这些位置: ${JSON.stringify(o.hits)}`);
console.log(`分段数组字段统计: ${JSON.stringify(o.arrays)}  合计 ${o.segCount} 条，不同 id ${o.uniqSeg} 个`);
console.log('\n第一个分段对象的非空字段:');
for (const k of o.oneKeys || []) console.log('   ' + k);
ws.close(); process.exit(0);
