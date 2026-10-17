// 验 v0.3.4 新加的仪表本身有没有装上（不看播放，只看计数器与三态）。
// 关键是把「判据没认对」和「页面被 Chrome 冻住」这两种情况在面板上能分开显示，
// 所以这里用一次 4 秒的主线程阻塞去**人为制造**节流，看迟到计数会不会抓到它。
//   node .cdp/panel-instr.mjs
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9225';
const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('/MyCourse/Study'));
if (!tabs.length) { console.error('没有学习页，先在 9225 上进一条视频'); process.exit(1); }
const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200); return r.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = async (e) => JSON.parse(await evl(e));
const snap = () => J(`JSON.stringify((()=>{const v=document.querySelector('video'),G=window.__kgPanel&&window.__kgPanel.G;
  return{ver:(window.__kgPanel||{}).version,mode:G&&G.mode,muted:v&&v.muted,vol:v&&+Number(v.volume).toFixed(3),
  late:G&&Math.round(G.late||0),pauseSeen:G&&G.pauseSeen,pauses:G&&G.pauses,
  tail:G&&G.log.slice(-3).join(' || ')}})())`);

let s = await snap();
console.log(`当前构建 v${s.ver} · 模式 ${s.mode} · muted=${s.muted} volume=${s.vol} · 日志尾：${s.tail}`);
if (s.ver !== '0.3.4') { console.error('页面上跑的不是 v0.3.4，下面的结论都不算'); process.exit(1); }

console.log('\n[1] 声音三态循环（点面板按钮，看 video 上的实际值）');
for (let i = 0; i < 3; i++) {
  await evl(`(()=>{const b=document.getElementById('kg-sound');b.click();return 1})()`);
  await sleep(1600);
  const x = await snap();
  console.log(`  → ${x.mode}：muted=${x.muted} volume=${x.vol}`);
}

console.log('\n[2] 人为阻塞主线程 4 秒，节流看门狗应当抓到并写日志');
await evl('(()=>{const t=Date.now();while(Date.now()-t<4000){}return 1})()');
await sleep(2500);
const y = await snap();
console.log(`  迟到计数 ${y.late}ms（>3000 才算抓到）· 日志尾：${y.tail}`);

console.log('\n[3] 暂停事件计数：第一条该接手，第二条（刚碰过播放器）不该接手');
await evl(`(()=>{const v=document.querySelector('video');v.__kgUserAt=0;v.play().catch(()=>{});return 1})()`);
await sleep(1200);
await evl(`(()=>{const v=document.querySelector('video');v.pause();return 1})()`);
await sleep(900);
await evl(`(()=>{const v=document.querySelector('video');v.play().catch(()=>{});return 1})()`);
await sleep(1200);
await evl(`(()=>{const v=document.querySelector('video');v.__kgUserAt=Date.now();v.pause();return 1})()`);
await sleep(2500);
const z = await snap();
console.log(`  pauseSeen=${z.pauseSeen} 接手=${z.pauses}（预期 pauseSeen=2、接手=1）`);
console.log(`  日志尾：${z.tail}`);
console.log(z.late > 3000 && z.pauseSeen >= 2 ? '\n✓ 仪表可用' : '\n? 有仪表没达标，看上面几行');
ws.close(); process.exit(0);
