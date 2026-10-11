// 用交付物本体（.user.js）在 document-start 注入，重载学习页并起播
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const fs = await import('node:fs');
const SRC = fs.readFileSync(new URL('../hailang-background-play.user.js', import.meta.url), 'utf8');
const tab = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page').find((t) => t.url.includes('MyCourse/Study'));
const url = tab.url;
let seq = 0;
const pend = new Map();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(new Error('ws error'));
  ws.onmessage = (m) => {
    const x = JSON.parse(m.data);
    if (x.id && pend.has(x.id)) {
      const p = pend.get(x.id);
      pend.delete(x.id);
      x.error ? p.rej(new Error(x.error.message)) : p.res(x.result);
    }
  };
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pend.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evl = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.enable');
await send('Runtime.enable');
const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', { source: SRC });
console.log('已在 document-start 注册脚本, identifier=', identifier);
await send('Page.navigate', { url });
await sleep(9000);

console.log('伪装是否先于站点代码生效:', await evl(`(()=>{const d=Object.getOwnPropertyDescriptor(document,'hidden');return JSON.stringify({ownPropOverridden:!!d, hiddenNow:document.hidden, visNow:document.visibilityState})})()`));
for (let i = 0; i < 10; i++) {
  const has = await evl(`!!document.querySelector('video')`);
  if (has) break;
  await sleep(2000);
}
console.log('起播:', await evl(`(()=>{const v=document.querySelector('video');if(!v)return 'NOVIDEO';return v.play().then(()=>JSON.stringify({t:+v.currentTime.toFixed(1),d:+v.duration.toFixed(1),paused:v.paused})).catch(e=>'play失败:'+e.name)})()`));
await sleep(2500);
console.log('2.5s 后:', await evl(`JSON.stringify({t:+document.querySelector('video').currentTime.toFixed(1),paused:document.querySelector('video').paused,vis:document.visibilityState})`));
ws.close();
process.exit(0);
