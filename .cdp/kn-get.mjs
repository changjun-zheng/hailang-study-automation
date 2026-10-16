// 只读：courseCatalogKnowledgeExercise/exercisesList 要 GET（POST 被拒），
// 试几组 query 参数，并把 videoId 从子节点取真（上一版从父节点取，拿到 null 等于没测）。
//   node .cdp/kn-get.mjs
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
  const CID='e8716aab5bc18a56b115d3303f43555c',SC='2c235454cef7b898bd11e77ad2b0d20c',MID='9f07cf1e06d0a57957bd6be34efd3930',VER='BK_RJGC_2024';
  const tr=await (await fetch('/gateway/study/courseCatalog/tree',{method:'POST',headers:H,body:JSON.stringify({courseId:CID})})).json();
  // 找一个既有知识点又有视频的节点（视频可能挂在自身或子节点）
  let pick=null;
  const w=(n)=>{ const kns=n.courseKnowledgeNodeGraphList||[];
    const vids=n.courseCatalogVideoVos||[];
    if(!pick&&kns.length){ let vid=vids.length?vids[0].id:null;
      if(!vid) for(const c of (n.childList||[])) for(const v of (c.courseCatalogVideoVos||[])) { vid=v.id; break; }
      pick={unitId:n.id,unitName:n.name,kn:kns[0],vid}; }
    for(const x of (n.childList||[])) w(x); };
  w(tr.data||{});
  const get=async(u)=>{try{const r=await fetch(u,{headers:{Authorization:t}});const txt=String(await r.text());
    let j=null;try{j=JSON.parse(txt)}catch(e){}
    if(!j)return 'HTTP'+r.status+' 非JSON '+txt.slice(0,70);
    const n=Array.isArray(j.data)?j.data.length:null;
    return 'code='+j.code+' msg='+String(j.msg).slice(0,30)+' '+(n!==null?'★数组'+n+'条':'data='+JSON.stringify(j.data).slice(0,50))}catch(e){return '抛异常 '+String(e).slice(0,70)}};
  const q=(o)=>Object.entries(o).map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');
  const out={};
  const b={knowledgeNodeId:pick.kn.id,studentCourseId:SC,unitId:pick.unitId};
  out['GET 三件套']=await get('/gateway/study/courseCatalogKnowledgeExercise/exercisesList?'+q(b));
  out['GET +courseId']=await get('/gateway/study/courseCatalogKnowledgeExercise/exercisesList?'+q({...b,courseId:CID}));
  out['GET +videoId']=await get('/gateway/study/courseCatalogKnowledgeExercise/exercisesList?'+q({...b,videoId:pick.vid||''}));
  out['GET 全字段']=await get('/gateway/study/courseCatalogKnowledgeExercise/exercisesList?'+q({...b,courseId:CID,videoId:pick.vid||'',majorId:MID,version:VER}));
  out['GET businessId']=await get('/gateway/study/courseCatalogKnowledgeExercise/exercisesList?'+q({...b,knowledgeNodeId:pick.kn.businessId}));
  out['GET 只 businessId+sc']=await get('/gateway/study/courseCatalogKnowledgeExercise/exercisesList?'+q({knowledgeNodeId:pick.kn.businessId,studentCourseId:SC}));
  return JSON.stringify({unitName:pick.unitName,knName:pick.kn.name,vid:pick.vid,out})
})()`;

const o = JSON.parse(await evl(expr));
console.log(`单元「${o.unitName}」知识点「${o.knName}」videoId=${String(o.vid).slice(0, 16)}`);
for (const [k, v] of Object.entries(o.out)) console.log(`  ${k.padEnd(24)} ${v}`);
ws.close(); process.exit(0);
