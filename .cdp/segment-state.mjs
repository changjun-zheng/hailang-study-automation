// 只读：找出「视频分段是否看完」这个状态到底在哪个字段。
// 做法：拿 progressDetails 里一个视频的 courseCatalogVideoSegments，把分段对象的全部字段
// 连值一起打出来，再和同一视频下"已完成/未完成"的两段对比，找出差异字段。
// 对照样本用你截图里那条：computed(已完成) vs 可写的计算属性(未完成)。
//   node .cdp/segment-state.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
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
  const pd=await fetch('/gateway/system/orgStudent/progressDetails?studentId='+(me.studyNumber||me.id)+'&id=${CID}&majorId=${MID}&studentCourseId=${SC}&version=BK_RJGC_2024',{headers:{Authorization:t}}).then(r=>r.json());
  // 找「使用计算属性-1」这条视频
  let vid=null,unitName='';
  const walk=(n)=>{ for(const v of (n.courseCatalogVideoVos||[])) if(!vid&&String(v.name||'').includes('使用计算属性-1')){vid=v;unitName=n.name;} for(const c of (n.children||[])) walk(c); };
  (Array.isArray(pd.data)?pd.data:[]).forEach(walk);
  if(!vid) return JSON.stringify({err:'没找到该视频'});
  const segs=vid.courseCatalogVideoSegments||[];
  return JSON.stringify({unitName,videoName:vid.name,videoId:vid.id,
    videoLevelFields:Object.fromEntries(Object.entries(vid).filter(([k,v])=>/have|time|status|learn|pos|flag|complete/i.test(k)&&v!==null&&v!==undefined)),
    segCount:segs.length,
    segs:segs.map(s=>({name:s.segmentName||s.name,
      fields:Object.fromEntries(Object.entries(s).filter(([k,v])=>v!==null&&v!==undefined&&v!==''&&!Array.isArray(v)&&typeof v!=='object'))}))})
})()`;

const o = JSON.parse(await evl(expr));
if (o.err) { console.log(o.err); ws.close(); process.exit(1); }
console.log(`单元「${o.unitName}」视频「${o.videoName}」 id=${String(o.videoId).slice(0, 14)} 分段数=${o.segCount}`);
console.log(`视频级与进度有关的字段: ${JSON.stringify(o.videoLevelFields)}`);
console.log(`\n各分段的标量字段（找那个"看完/没看完"的判据）：`);
for (const s of o.segs) console.log(`  ${String(s.name).padEnd(22)} ${JSON.stringify(s.fields)}`);
// 差异字段
if (o.segs.length >= 2) {
  const keys = new Set(o.segs.flatMap((s) => Object.keys(s.fields)));
  const diff = [...keys].filter((k) => new Set(o.segs.map((s) => JSON.stringify(s.fields[k]))).size > 1);
  console.log(`\n分段之间取值不同的字段（完成判据应在其中）: ${diff.join(', ') || '(无差异字段 → 分段状态不在这个响应里，需要另找接口)'}`);
}
ws.close(); process.exit(0);
