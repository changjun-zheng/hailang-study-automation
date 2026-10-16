// 只读：验 progressDetails 里分段 status 到底是不是"学生进度"。
// 判据：若它是学生进度，则 (a) 同一门课里应同时存在 2 和非 2；(b) 整片 haveTime 未满的视频，
// 其分段应更差；(c) 我们已确认服务端记为完成(studyVideoStatus=2)且时长满的视频，分段应全 =2。
//   node .cdp/segment-control.mjs
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
  const G=(x)=>fetch(x,{headers:{Authorization:t}}).then(r=>r.json()).catch(()=>({}));
  const pd=await G('/gateway/system/orgStudent/progressDetails?studentId='+(me.studyNumber||me.id)+'&id=${CID}&majorId=${MID}&studentCourseId=${SC}&version=BK_RJGC_2024');
  const rows=[];
  const walk=(n)=>{ for(const v of (n.courseCatalogVideoVos||[])){
      const segs=(v.courseCatalogVideoSegments||[]);
      if(segs.length) rows.push({unit:n.name,vid:v.name,len:v.timeLength,have:v.haveTime,
        segAll:segs.length,segDone:segs.filter(s=>s.status===2).length,
        names:segs.map(s=>(s.segmentName||'')+':'+s.status).join(' ')});
    } for(const c of (n.children||[])) walk(c); };
  (Array.isArray(pd.data)?pd.data:[]).forEach(walk);
  // 再取关卡侧的 studyVideoStatus 做交叉（同一批视频）
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId=${CID}&majorId=${MID}&userId='+me.id+'&version=BK_RJGC_2024&studentCourseId=${SC}');
  const sv={};
  for(const b of bs.data||[]){const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId=${SC}');
    for(const n of ns.data||[]) if(n.videoId) sv[n.videoId]={st:n.studyVideoStatus,name:n.catalogName};}
  return JSON.stringify({rows,sv})
})()`;

const { rows, sv } = JSON.parse(await evl(expr));
const done = rows.filter((r) => r.segDone === r.segAll);
const part = rows.filter((r) => r.segDone > 0 && r.segDone < r.segAll);
const none = rows.filter((r) => r.segDone === 0);
console.log(`带分段的视频 ${rows.length} 条：分段全完成 ${done.length}、部分完成 ${part.length}、一个都没完成 ${none.length}`);
console.log(`→ 若三者同时存在，说明 status 不是内容发布状态（发布状态不会因视频而异步分布），而是学生进度\n`);
console.log('部分完成的视频（这些就是"整片时长满但单元未完成"的元凶）：');
for (const r of part.slice(0, 12)) console.log(`  ${String(r.vid).slice(0, 26).padEnd(28)} 时长${String(r.have).padEnd(10)}/${r.len} 分段 ${r.segDone}/${r.segAll}  [${r.names}]`);
console.log('\n交叉核对：分段全完成的视频，其关卡侧 studyVideoStatus 应=2');
let agree = 0, disagree = 0, unknown = 0;
for (const r of done) {
  const k = Object.keys(sv).find((vid) => (sv[vid].name || '') === r.vid);
  if (!k) { unknown++; continue; }
  if (sv[k].st === 2) agree++; else { disagree++; console.log(`  ! 「${r.vid}」分段全完成但关卡 status=${sv[k].st}`); }
}
console.log(`  一致 ${agree}、不一致 ${disagree}、关卡侧查不到 ${unknown}`);
console.log('\n一个都没完成但时长已满的视频（若存在＝分段与时长脱钩，需另找触发）：');
for (const r of none.filter((x) => x.have && x.have !== '00:00:00').slice(0, 8)) console.log(`  ${String(r.vid).padEnd(28)} 时长${r.have}/${r.len} [${r.names}]`);
ws.close(); process.exit(0);
