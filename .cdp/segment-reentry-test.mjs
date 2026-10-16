// 只读实验：验证"重新进入视频（不播放）是否会让服务端重算分段状态"。
// 若成立，30 条缺口只需逐条打开几秒，而不是重播 6 小时。
// 全程不 seek、不 dispatch 键盘、不调任何 save*/create* 接口 —— 只做页面导航 + 读状态。
//   node .cdp/segment-reentry-test.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const NAME = process.argv[2] || '1010-视频-明确系统目标';
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const CID = '4ca322facea6bd5f080250c14990b91b'; // 占位，下面按课程名查
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
const COURSE = '软件系统分析与设计';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ver = await (await fetch(BASE + '/json/version')).json();
const bws = new WebSocket(ver.webSocketDebuggerUrl);
const bp = new Map(); let bid = 0;
await new Promise((r) => (bws.onopen = r));
bws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && bp.has(x.id)) { const p = bp.get(x.id); bp.delete(x.id); p(x.result); } };
const bask = (method, params) => new Promise((res) => { const id = ++bid; bp.set(id, res); bws.send(JSON.stringify({ id, method, params })); });

const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && t.url.includes('study.cqie.edu.cn'));
if (!tabs.length) { console.error('没有 study 标签页'); process.exit(1); }
const tab = tabs[0];
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.exception?.description || '').slice(0, 150); return r.result?.value; };
await send('Page.enable'); await send('Runtime.enable');

const findExpr = `(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const cs=await fetch('/gateway/frequent/orgStudent/pagedMyCourse',{method:'POST',headers:H,body:JSON.stringify({filters:{courseNature:null,name:'',schoolYear:'',studentId:me.id,term:'',courseFlag:0},pageIndex:1,pageSize:50})}).then(r=>r.json());
  const c=((cs.data&&(cs.data.records||cs.data.list))||[]).find(x=>String(x.name||'').includes(${JSON.stringify(COURSE)}));
  if(!c) return JSON.stringify({err:'没这门课'});
  const sid=c.studentCourseId||c.id, ver=c.version||'BK_RJGC_2024';
  const pd=await fetch('/gateway/system/orgStudent/progressDetails?studentId='+(me.studyNumber||me.id)+'&id='+c.id+'&majorId='+me.majorId+'&studentCourseId='+sid+'&version='+ver,{headers:{Authorization:t}}).then(r=>r.json());
  let hit=null;
  const walk=(n)=>{ for(const v of (n.courseCatalogVideoVos||[])) if(!hit&&String(v.name||'').includes(${JSON.stringify(NAME)})) hit={unitId:v.unitId||n.id,videoId:v.id,name:v.name,len:v.timeLength,have:v.haveTime,
    segs:(v.courseCatalogVideoSegments||[]).map(s=>({n:s.segmentName,st:s.status}))};
    for(const ch of (n.children||[])) walk(ch); };
  (Array.isArray(pd.data)?pd.data:[]).forEach(walk);
  if(!hit) return JSON.stringify({err:'没找到该视频'});
  return JSON.stringify({course:c.name,cid:c.id,sid,ver,majorId:me.majorId,hit})
})()`;

let o = JSON.parse(await evl(findExpr));
if (o.err) { console.error(o.err); process.exit(1); }
const before = o.hit.segs.map((s) => `${s.n}:${s.st}`).join(' ');
console.log(`【前】${o.hit.name} 时长${o.hit.have}/${o.hit.len}  分段 ${before}`);

const url = `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=${o.cid}&studentCourseId=${o.sid}&version=${o.ver}&courseUnitId=${o.hit.unitId}&videoId=${o.hit.videoId}&majorId=${o.majorId}`;
await send('Page.navigate', { url });
console.log('只导航到该视频页，等待 30 秒（不播放、不 seek、不发任何写接口）…');
await sleep(30000);

o = JSON.parse(await evl(findExpr));
const after = o.hit.segs.map((s) => `${s.n}:${s.st}`).join(' ');
console.log(`【后】${o.hit.name} 时长${o.hit.have}/${o.hit.len}  分段 ${after}`);
console.log(before === after ? '\n→ 无变化：重新进入不足以重算分段，需要真的覆盖播放' : '\n→ 有变化：重新进入即可让服务端重算分段，代价从小时级降到秒级');
ws.close(); bws.close(); process.exit(0);
