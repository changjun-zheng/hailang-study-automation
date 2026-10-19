// 验 v0.5.1 的做题反馈：按钮会不会自己变（⏳ 做题中… 已交 N 道 → ✓/＝/✗），结果栏有没有写清。
// 顺带把指定课程的客观题真做掉（挑还有题没做的课才有信号；全做完了只会得到"＝ 本来就做完了"，那也是一种有效反馈）。
//   node .cdp/test-answer-feedback.mjs [软件工程]
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9226';
const COURSE = process.argv[2] || '软件工程';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function evl(expr) {
  const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('study.cqie.edu.cn'));
  if (!tabs.length) return 'NOTAB';
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const out = await new Promise((res) => {
    ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id === 1) res(x.result?.result?.value ?? 'NOVAL'); };
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
    setTimeout(() => res('TIMEOUT'), 20000);
  });
  try { ws.close(); } catch (e) { }
  return typeof out === 'string' ? out : JSON.stringify(out);
}
const SNAP = `JSON.stringify((()=>{const G=window.__kgPanel&&window.__kgPanel.G;return{
  ver:(window.__kgPanel||{}).version||'无',
  按钮:((document.getElementById('kg-ans')||{}).textContent||'-').slice(0,30),
  结果:((document.getElementById('kg-ansstat')||{}).textContent||'-').slice(0,120),
  进行中:G?!!G.answering:null,已交:G?G.ansDone:null,状态:G?G.ansState:null}})())`;

const WANT = (await import('node:fs')).readFileSync('hailang-panel.user.js', 'utf8').match(/@version\s+(\S+)/)[1];
console.log(`等注入器把 v${WANT} 换上…`);
let v = '';
for (let i = 0; i < 12; i++) {
  await sleep(3000);
  v = JSON.parse(await evl(SNAP)).ver;
  if (v === WANT) break;
}
console.log(`页面上现在是 v${v}`);
if (v !== WANT) { console.error('注入器还没换上新版，先别测'); process.exit(1); }

const go = await evl(`(()=>{const G=window.__kgPanel.G;const c=G.list.find(x=>(x.name||'').includes(${JSON.stringify(COURSE)}));
  if(!c)return 'NOCOURSE:'+G.list.map(x=>x.name).join('/');
  window.__kgPanel.doAnswer({id:c.id,name:c.name,sid:c._sid,ver:c.version||'BK_RJGC_2024'});return 'FIRED'})()`);
console.log(`对【${COURSE}】发起做题：${go}`);
if (!go.startsWith('FIRED')) process.exit(1);

let last = '', sawRun = false, fin = null;
for (let i = 1; i <= 45; i++) {
  await sleep(2000);
  const s = JSON.parse(await evl(SNAP));
  const line = `按钮「${s.按钮}」 状态=${s.状态} 已交=${s.已交}`;
  if (line !== last) { console.log(`  +${i * 2}s ${line}`); last = line; }
  if (s.状态 === 'run') sawRun = true;
  if (s.状态 && s.状态 !== 'run') { fin = s; break; }
}
console.log(`\n判读：过程中按钮进入过"做题中"态 = ${sawRun ? '✓' : '✗'}；结束时按钮「${fin ? fin.按钮 : '-'}」`);
console.log(`结果栏：${fin ? fin.结果 : '（没抓到）'}`);
process.exit(sawRun && fin ? 0 : 1);
