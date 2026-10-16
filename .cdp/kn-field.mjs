// 只读性质的字段名探针：问出 studyKnowledgeExerciseSummaryRecord/createList 的 poList 元素里
// "分段知识点id"到底叫什么。
// 天然不会写进数据：字段名猜错 → 服务端按缺列报 SQL 错误（segment_knowledge_id 无默认值，插入失败）；
// 字段名猜对 → Jackson 类型错。两种都不会落库。
//   node .cdp/kn-field.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
const UNIT = '6814946beba252b0ae35bf229d454ae7';
const VID = '3159e08af4683e6e8736a9015ebcae9e';
const SEG = '7c95f99852bad83f3e3e1d6d39153cde';

const all = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && t.url.includes('study.cqie.edu.cn'));
let KEEP = null; try { KEEP = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id; } catch {}
const full = all.find((t) => t.id === KEEP) || all[0];
const ws = new WebSocket(full.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', String(r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

const NAMES = ['segmentKnowledgeId', 'knowledgeNodeId', 'knowledgeId', 'segmentId', 'videoSegmentKnowledgeId',
  'segmentKnowledgeNodeId', 'nodeId', 'knowledgeSummaryId', 'id', 'studyKnowledgeNodeId', 'videoKnowledgeId'];

const expr = `(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const P=(b)=>fetch('/gateway/study/studyKnowledgeExerciseSummaryRecord/createList',{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.text()).catch(e=>'ERR'+e);
  const out=[];
  for(const n of ${JSON.stringify(NAMES)}){
    // 故意不给 exercisesId 等必填：让业务校验也有机会拒绝；同时把探的字段塞成对象触发类型错
    const body={poList:[{[n]:{}}],studentCourseId:'${SC}',studentId:me.id,courseId:'${CID}',videoId:'${VID}',unitId:'${UNIT}',majorId:'${MID}',version:'BK_RJGC_2024'};
    const txt=String(await P(body)).replace(/\\s+/g,' ');
    const hit=/JSON parse error|MismatchedInput/.test(txt);
    const m=txt.match(/"StudyKnowledge[^"]*\\["([^"]+)\\"]/) || txt.match(/field name '@?[a-zA-Z]+/g);
    out.push({n,hit,named:m?String(m[1]||m[0]).slice(0,40):null,head:txt.slice(0,150)});
  }
  return JSON.stringify(out)
})()`;

const rows = JSON.parse(await evl(expr));
console.log('poList 元素字段探针（hit=触发 Jackson 类型错，说明该名字是真实字段）：');
for (const r of rows) console.log(`  ${r.hit ? '✓' : '·'} ${r.n.padEnd(26)} ${r.head.slice(0, 120)}`);
ws.close(); process.exit(0);
