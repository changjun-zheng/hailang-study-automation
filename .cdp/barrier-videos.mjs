// 只读：把「关卡自身挂视频」和「子节点挂视频」两种形态分清楚，定位课程被漏记的那条。
//   node .cdp/barrier-videos.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const SC = process.env.SC || '2c235454cef7b898bd11e77ad2b0d20c';
const CID = process.env.CID || 'e8716aab5bc18a56b115d3303f43555c';
const MID = process.env.MID || '9f07cf1e06d0a57957bd6be34efd3930';

const all = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && t.url.includes('study.cqie.edu.cn'));
const KEEP = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id; } catch { return null; } })();
const full = all.find((t) => t.id === KEEP) || all[0];
if (!full) { console.log('找不到 study 标签页'); process.exit(1); }
const ws = new WebSocket(full.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

const o = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t};
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const G=(x)=>fetch(x,{headers:H}).then(r=>r.json()).catch(()=>({}));
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId=${CID}&majorId=${MID}&userId='+me.id+'&version=BK_RJGC_2024&studentCourseId=${SC}');
  const out=[];
  for(const b of bs.data||[]){
    const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId=${SC}');
    const kids=(ns.data||[]).filter(n=>n.videoId);
    out.push({name:b.name,bid:b.id,barrierVideoId:b.videoId||null,barrierLen:b.timeLength||0,barrierStatus:b.studyVideoStatus,kids:kids.length});
  }
  return JSON.stringify(out)
})()`));

let kidTotal = 0, ownOnly = 0;
console.log('关卡名 | 关卡自身videoId | 自身片长 | 自身状态 | 子节点带视频的条数');
for (const b of o) {
  kidTotal += b.kids;
  if (b.barrierVideoId && b.kids === 0) ownOnly++;
  console.log(`${String(b.name).padEnd(16)} | ${(b.barrierVideoId || '—').slice(0, 16).padEnd(17)} | ${String(b.barrierLen).padEnd(9)} | ${String(b.barrierStatus).padEnd(9)} | ${b.kids}`);
}
console.log(`\n子节点视频合计 = ${kidTotal} 条（这是 runner 终态门数到的口径）`);
console.log(`只挂在关卡自身、子节点为空的关卡 = ${ownOnly} 个 —— 这些是 videosOf() 完全看不到的`);
ws.close(); process.exit(0);
