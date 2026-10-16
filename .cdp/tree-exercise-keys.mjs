// 只读：在目录树/权威进度树里找"已经随树下发"的习题数组，判断知识练习是否需要另外的接口。
// 上一轮点「知识练习(1题)」标签没发出任何请求，说明数据要么已在树里，要么在嵌入式预览应用内。
//   node .cdp/tree-exercise-keys.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
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
  const G=(x)=>fetch(x,{headers:{Authorization:t}}).then(r=>r.json()).catch(e=>({err:String(e)}));
  const out={};
  const 计数=(root,label)=>{
    const acc={}; const samples={};
    const walk=(n)=>{ if(!n||typeof n!=='object')return;
      for(const k of Object.keys(n)){ const v=n[k];
        if(Array.isArray(v)&&/exercise|question|exam|answer/i.test(k)){ acc[k]=(acc[k]||0)+v.length; if(v.length&&!samples[k]) samples[k]={parent:n.name||n.catalogName||'',keys:Object.keys(v[0]||{}).slice(0,14),sampleType:v[0].questionType,qid:v[0].id}; }
      }
      for(const c of (n.childList||[])) walk(c); for(const c of (n.children||[])) walk(c);
    };
    walk(root);
    return {label,acc,samples};
  };
  const tr=await P('courseCatalog/tree',{courseId:'${CID}'});
  out.tree=计数(tr.data||{},'courseCatalog/tree');
  const pd=await G('/gateway/system/orgStudent/progressDetails?studentId='+(me.studyNumber||me.id)+'&id=${CID}&majorId='+me.majorId+'&studentCourseId=${SC}&version=BK_RJGC_2024');
  out.pd=计数(Array.isArray(pd.data)?{childList:pd.data}:{},"progressDetails");
  // 知识点节点自身有没有带练习字段（遍历一个知识节点的全部键）
  let kn=null; const w3=(n)=>{ if(!kn&&(n.courseKnowledgeNodeGraphList||[]).length) kn=n.courseKnowledgeNodeGraphList[0]; for(const x of (n.childList||[])) w3(x); };
  w3(tr.data||{});
  out.knAllKeys=kn?Object.entries(kn).filter(([k,v])=>v!==null&&v!==undefined&&v!=='').map(([k,v])=>k+'='+(Array.isArray(v)?'数组'+v.length:typeof v)).slice(0,20):null;
  return JSON.stringify(out)
})()`;

const o = JSON.parse(await evl(expr));
for (const part of [o.tree, o.pd]) {
  console.log(`\n【${part.label}】里与习题相关的数组字段（累加长度）：`);
  const e = Object.entries(part.acc);
  if (!e.length) console.log('   （无）');
  for (const [k, v] of e) console.log(`   ${k} = ${v} 条`);
  for (const [k, s] of Object.entries(part.samples)) console.log(`   样例 ${k}: 属于「${s.parent}」 questionType=${s.sampleType} id=${String(s.qid).slice(0, 10)}\n     键: ${s.keys.join(', ')}`);
}
console.log('\n知识节点对象上非空的字段（看它自己带不带练习）：');
for (const k of o.knAllKeys || []) console.log('   ' + k);
ws.close(); process.exit(0);
