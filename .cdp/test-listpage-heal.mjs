// 复现并验证他报的那条：人在课程列表页（/MyCourse/Paged）、队列还在，点绿按钮没反应也不知道有没有在刷。
// 做法：把学习页导航到列表页，然后只看两件事 —— 面板会不会自己跳回学习页、跳回去之后还在不在播。
// 不注入任何东西：注入器（inject-keeper）负责把面板补回来，这正是要验的闭环。
//   node .cdp/test-listpage-heal.mjs [http://127.0.0.1:9226]
const BASE = process.argv[2] || 'http://127.0.0.1:9226';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function first() {
  const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('study.cqie.edu.cn'));
  if (!tabs.length) return null;
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const pend = new Map();
  ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
  const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); try { ws.send(JSON.stringify({ id, method: m, params: p })); } catch (e) { pend.delete(id); rej(e); } });
  const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC'; return r.result?.value; };
  return { ws, send, evl, url: tabs[0].url };
}
const SNAP = `JSON.stringify((()=>{const v=document.querySelector('video');
  let job=null;try{job=JSON.parse(localStorage.getItem('kg-job')||'null')}catch(e){}
  return{路径:location.pathname.replace('/stu/pages/',''),面板:(window.__kgPanel||{}).version||'无',
  有视频:!!v,在播:v&&!v.paused,按钮:((document.getElementById('kg-run')||{}).textContent||'-').slice(0,34),有任务:!!job}})())`;
let c = await first();
await c.send('Page.enable');
console.log('把页面扔到课程列表页：' + c.url.slice(0, 60) + '…');
await c.send('Page.navigate', { url: 'https://study.cqie.edu.cn/stu/pages/MyCourse/Paged' });
try { c.ws.close(); } catch (e) { }
let healed = false, playing = false;
for (let i = 1; i <= 14; i++) {
  await sleep(10000);
  c = await first();
  if (!c) { console.log(`  +${i * 10}s 连不上`); continue; }
  const s = JSON.parse(await c.evl(SNAP));
  console.log(`  +${i * 10}s ${s.路径} 面板${s.面板} 有视频=${s.有视频} 在播=${s.在播} 任务=${s.有任务} 按钮「${s.按钮}」`);
  try { c.ws.close(); } catch (e) { }
  if (/Study/.test(s.路径) && s.有视频) { healed = true; playing = !!s.在播; break; }
}
console.log(healed ? `\n✓ 自己跳回了学习页并${playing ? '在播' : '停着（下一跳内会自己起播）'} —— 列表页卡住不再需要人点` : '\n✗ 140 秒了还停在列表页，这条没修好，别对外说已解决');
process.exit(healed ? 0 : 1);
