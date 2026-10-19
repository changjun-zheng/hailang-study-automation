// 产品级验证：面板**不靠人点**，只调它自己的「继续起播」（内部是合成手势打在 elementFromPoint
// 命中的元素上），然后连续 180 秒采样服务端 haveTime。
// 判据只有一条：haveTime 涨不涨。心跳只能证明"在上报"，涨满才证明"记上了账"。
// 期间页面会被 Chrome 判成 hidden、站点会自停，面板的接手负责把它拉回来 —— 这正是真实使用场景。
//   node .cdp/panel-autostart.mjs
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9225';
const SRC = 'hailang-panel.user.js';
const fs = await import('node:fs');
const toSec = (t) => String(t || '0:0:0').split(':').reduce((a, p) => a * 60 + (parseInt(p, 10) || 0), 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tabs0 = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('/MyCourse/Study'));
if (!tabs0.length) { console.error('没有学习页'); process.exit(1); }
const URL0 = tabs0[0].url;
let ws, seq = 0; const pend = new Map();
async function connect() {
  const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('/MyCourse/Study'));
  ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
  await send('Page.enable');
}
const send = (m, p = {}) => new Promise((res, rej) => {
  const id = ++seq; pend.set(id, { res, rej });
  try { ws.send(JSON.stringify({ id, method: m, params: p })); } catch (e) { pend.delete(id); rej(e); }
});
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 160); return r.result?.value; };
const J = async (e) => JSON.parse(await evl(e));
const SNAP = () => J(`JSON.stringify((()=>{const d=Object.getOwnPropertyDescriptor(Document.prototype,'hidden');const v=document.querySelector('video');
  const G=window.__kgPanel&&window.__kgPanel.G;
  return{hidden:d.get.call(document),cur:v?+v.currentTime.toFixed(1):-1,paused:v?v.paused:null,
  ver:(window.__kgPanel||{}).version,beats:G?G.beats:null,pauses:G?G.pauses||0:null,tail:G?G.log.slice(-1)[0]:null}})())`);
const have = () => J(`(async()=>{const t=localStorage.getItem('token2'),me=JSON.parse(localStorage.getItem('userInfo2')||'{}'),q=new URLSearchParams(location.search);
  const d=await fetch('/gateway/system/orgStudent/myCourseDetails?studentId='+(me.studyNumber||me.id)+'&id='+q.get('id')+'&majorId='+me.majorId+'&studentCourseId='+q.get('studentCourseId')+'&version='+(q.get('version')||'BK_RJGC_2024'),{headers:{Authorization:t}}).then(r=>r.json()).catch(()=>({}));
  return JSON.stringify({have:(d.data&&d.data.haveTime)||'0:0:0',sum:(d.data&&d.data.sumTime)||'0:0:0'})})()`);

await connect();
await send('Page.navigate', { url: URL0 });
await sleep(14000);
console.log('注入面板并只调它自己的「继续起播」按钮（不给任何可信输入）…');
await evl(`(()=>{window.__kgBuilt=1;window.__kgPanel=null;const p=document.getElementById('kg-panel');if(p)p.remove();return 1})()`);
await evl(fs.readFileSync(SRC, 'utf8') + '\n;"ok"');
await sleep(2600);
const s0 = await SNAP();
const WANT = (fs.readFileSync(SRC, 'utf8').match(/@version\s+(\S+)/) || [])[1];
if (s0.ver !== WANT) { console.error(`页面上是 v${s0.ver}，不是 ${WANT}，作废`); process.exit(1); }
const b0 = await have();
if (process.env.AUTO) {
  // 只写一条任务，不点任何按钮：让面板自己的 3 秒看门狗去发起播手势（全程零可信输入）
  await evl(`(()=>{const q=new URLSearchParams(location.search);
    localStorage.setItem('kg-job',JSON.stringify({stu:'probe',queue:[{id:q.get('id'),name:'探针这门课',sid:q.get('studentCourseId'),ver:q.get('version')||'BK_RJGC_2024'}],i:0,done:{},baseHave:${toSec(b0.have)},started:Date.now()}));
    return 1})()`);
  console.log('已只写入 kg-job，不点任何按钮 —— 看面板会不会自己起播');
} else {
  await evl(`(()=>{const b=document.getElementById('kg-play');b.click();return 1})()`);
}
const marks = [];
for (let i = 1; i <= 18; i++) {
  await sleep(10000);
  const s = await SNAP(), h = await have();
  marks.push({ t: i * 10, paused: s.paused, hidden: s.hidden, cur: s.cur, beats: s.beats, pauses: s.pauses, grew: toSec(h.have) - toSec(b0.have) });
  console.log(`  +${i * 10}s ${s.paused ? '停' : '播'}${s.hidden ? '（页面 native hidden）' : ''} 进度 ${s.cur} | 心跳 ${s.beats} | 接手 ${s.pauses} | haveTime ${h.have}（较起点 +${toSec(h.have) - toSec(b0.have)}s）`);
  console.log(`      日志尾：${s.tail}`);
}
const last = marks[marks.length - 1];
const played = marks.filter((m) => !m.paused).length;
console.log(`\n判读：180 秒里 ${played}/18 个采样点在播；haveTime 共 +${last.grew}s、心跳 ${last.beats} 次、面板接手 ${last.pauses} 次`);
console.log(last.grew >= 60 ? '  ✓ 合成手势（打在真正命中的元素上）就能起播并记账 —— "必须人点一下"这个限制可以去掉'
  : last.beats > 0 ? '  ? 心跳有、账没涨满：得再看是不是只记了一小段，别急着翻案'
    : '  ✗ 零心跳零记账：面板自己起播这条路确实不通');
ws.close(); process.exit(0);
