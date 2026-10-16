// 只读：挖「知识练习」这一层。它不在 studyRecordExercises/exercisesList 的单元口径里，
// 所以之前统计的 67 道只是章节习题，漏掉了知识点上挂的练习。
// 先看权威树里知识点节点长什么样、练习挂在哪、怎么取题。
//   node .cdp/knowledge-layer.mjs <课程id> <studentCourseId>
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const CID = process.argv[2] || 'e8716aab5bc18a56b115d3303f43555c';
const SC = process.argv[3] || '2c235454cef7b898bd11e77ad2b0d20c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';

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
  const pd=await G('/gateway/system/orgStudent/progressDetails?studentId='+(me.studyNumber||me.id)+'&id=${CID}&majorId='+me.majorId+'&studentCourseId=${SC}&version=BK_RJGC_2024');
  const r={pdCode:pd.code};
  // 找知识节点：任何带 knowledge 字样的数组
  const holders=new Map(); const knodes=[];
  const scan=(n,where)=>{
    if(!n||typeof n!=='object')return;
    for(const k of Object.keys(n)){
      if(/knowledge/i.test(k)&&Array.isArray(n[k])&&n[k].length){
        holders.set(k,(holders.get(k)||0)+n[k].length);
        for(const item of n[k]) knodes.push({where:k,parent:n.name||n.catalogName||'',item});
      }
    }
    for(const c of (n.children||[])) scan(c,where);
  };
  (Array.isArray(pd.data)?pd.data:[]).forEach(x=>scan(x,'root'));
  r.holders=[...holders.entries()].map(([k,v])=>k+':'+v);
  r.knodeCount=knodes.length;
  r.knodeSample=knodes.slice(0,3).map(x=>({where:x.where,parent:x.parent,keys:Object.keys(x.item||{}).slice(0,18),name:x.item.name||x.item.title||x.item.nodeName,id:x.item.id}));
  // 树接口的 knowledge 列表
  const tr=await P('courseCatalog/tree',{courseId:'${CID}'});
  const tk=[];
  const scan2=(n)=>{ if(!n||typeof n!=='object')return; for(const k of Object.keys(n)) if(/knowledge/i.test(k)&&Array.isArray(n[k])&&n[k].length) tk.push({key:k,n:n[k].length,sampleKeys:Object.keys(n[k][0]||{}).slice(0,16),parent:n.name}); for(const c of (n.childList||[])) scan2(c); };
  scan2(tr.data||{});
  r.treeHolders=tk.slice(0,4);
  r.treeHolderCount=tk.length;
  return JSON.stringify(r)
})()`;

const o = JSON.parse(await evl(expr));
console.log(`progressDetails code=${o.pdCode}`);
console.log(`带 knowledge 数组的字段统计: ${JSON.stringify(o.holders)}`);
console.log(`知识节点总数 = ${o.knodeCount}`);
for (const s of o.knodeSample || []) console.log(`  样例(${s.where}, 属于「${s.parent}」) id=${String(s.id).slice(0, 12)} name=${s.name}\n    键: ${s.keys.join(', ')}`);
console.log(`\ncourseCatalog/tree 里 knowledge 数组出现 ${o.treeHolderCount} 处：`);
for (const s of o.treeHolders || []) console.log(`  ${s.key} n=${s.n} 属于「${s.parent}」 键: ${s.sampleKeys.join(', ')}`);
ws.close(); process.exit(0);
