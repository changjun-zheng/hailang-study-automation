// 验 v0.5.0 移植进面板的做题流程：注入 → 直接调面板自己的 doAnswer()（和紫色按钮走同一个函数）
// → 盯它写进面板日志的汇总行 → 最后用 node 脚本独立复核服务端计数（不认面板自己的说法）。
// 挑「软件测试技术」是因为它还有 89 道没做，能真正走一遍写入路径。
//   node .cdp/panel-answer-test.mjs [软件测试技术]
import fs from 'node:fs';
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9226';
const COURSE = process.argv[2] || '软件测试技术';
const SRC = 'hailang-panel.user.js';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('study.cqie.edu.cn'));
if (!tabs.length) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); try { ws.send(JSON.stringify({ id, method: m, params: p })); } catch (e) { pend.delete(id); rej(e); } });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200); return r.result?.value; };
const J = async (e) => JSON.parse(await evl(e));
const VER = (fs.readFileSync(SRC, 'utf8').match(/@version\s+(\S+)/) || [])[1];

await evl(`(()=>{window.__kgBuilt=1;window.__kgPanel=null;const e=document.getElementById('kg-panel');if(e)e.remove();return 1})()`);
await evl(fs.readFileSync(SRC, 'utf8') + '\n;"ok"');
await sleep(6000);
let s = await J(`JSON.stringify((()=>{const G=window.__kgPanel&&window.__kgPanel.G;return{ver:(window.__kgPanel||{}).version||null,n:G?G.list.length:-1,have:G?G.answered:0}})())`);
console.log(`注入 v${s.ver}（期望 ${VER}），课程列表 ${s.n} 门`);
if (s.ver !== VER || s.n < 1) { console.error('面板没装好或课程没扫出来，作废'); process.exit(1); }

const go = await J(`(()=>{const G=window.__kgPanel.G;const c=G.list.find(x=>(x.name||'').includes(${JSON.stringify(COURSE)}));
  if(!c)return JSON.stringify({err:'列表里没有这门课，可选：'+G.list.map(x=>x.name).join(' / ')});
  window.__kgPanel.doAnswer({id:c.id,name:c.name,sid:c._sid,ver:c.version||'BK_RJGC_2024'});
  return JSON.stringify({ok:1,name:c.name})})()`);
if (go.err) { console.error(go.err); process.exit(1); }
console.log(`已调面板的 doAnswer()：【${go.name}】，盯它写日志…`);
let done = false;
for (let i = 1; i <= 40; i++) {
  await sleep(15000);
  const t = await J(`JSON.stringify((()=>{const G=window.__kgPanel.G;return{log:G.log.slice(-4),answering:!!G.answering,answered:G.answered||0}})())`);
  console.log(`  +${i * 15}s 进行中=${t.answering} 累计落库=${t.answered}`);
  for (const l of t.log) console.log(`      ${l}`);
  if (!t.answering && i > 1) { done = true; break; }
}
console.log(done ? '\n面板自己报完了。下面用 node 脚本独立复核服务端计数（不认面板的说法）' : '\n? 10 分钟还没跑完，先看上面日志卡在哪一步');
ws.close();
if (done) {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync('node', ['answer-exercises.mjs', '--cdp', BASE, '--course', COURSE], { cwd: '.', encoding: 'utf8', timeout: 280000 });
  console.log((r.stdout || '').split('\n').filter((x) => /课程「|已答|可提交|跳过|枚举行/.test(x)).slice(0, 6).join('\n'));
}
process.exit(0);
