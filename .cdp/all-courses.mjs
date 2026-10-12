// 只读：列出全部在修课程的官方进度口径（时长 / 单元 / 练习 / 考试），
// 用来判断"自动刷课"还差多少，而不是凭记忆说哪门已经完了。
//   node .cdp/all-courses.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');

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

const o = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const cs=await fetch('/gateway/frequent/orgStudent/pagedMyCourse',{method:'POST',headers:H,body:JSON.stringify({filters:{courseNature:null,name:'',schoolYear:'',studentId:me.id,term:'',courseFlag:0},pageIndex:1,pageSize:50})}).then(r=>r.json()).catch(e=>({err:String(e)}));
  const recs=(cs.data&&(cs.data.records||cs.data.list))||[];
  return JSON.stringify({err:cs.err||null,count:recs.length,rows:recs.map(c=>({
    name:c.name,percent:c.learned,pctFields:Object.entries(c).filter(([k,v])=>/have|sum|learn|percent|time/i.test(k)).map(([k,v])=>k+'='+v),
    sid:c.studentCourseId||c.id,cid:c.id,version:c.version}))})
})()`));

if (o.err) { console.log('取课失败：' + o.err); ws.close(); process.exit(1); }
console.log(`在修课程 ${o.count} 门（读的是平台自己的课程卡字段）：\n`);
for (const r of o.rows) {
  console.log(`【${r.name}】 已学=${r.percent}`);
  console.log('   ' + r.pctFields.join('  '));
}
ws.close(); process.exit(0);
