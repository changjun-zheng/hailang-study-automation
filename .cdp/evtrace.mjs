// 找进度上报的触发时机：播放 / seek / 暂停 / WS 帧 全记录
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const tab = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page').find((t) => t.url.includes('MyCourse/Study'));
let seq = 0;
const pend = new Map();
const ev = [];
let PH = 'init';
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
      return;
    }
    const p = x.params || {};
    if (x.method === 'Network.requestWillBeSent' && p.request.url.includes('/gateway/')) {
      ev.push({ ph: PH, k: 'http', v: p.request.method + ' ' + p.request.url.replace('https://study.cqie.edu.cn', '').slice(0, 95), body: (p.request.postData || '').slice(0, 200) });
    } else if (x.method === 'Network.webSocketFrameSent') {
      ev.push({ ph: PH, k: 'ws↑', v: (p.response.payloadData || '').slice(0, 160) });
    } else if (x.method === 'Network.webSocketCreated') {
      ev.push({ ph: PH, k: 'ws-open', v: p.url.slice(0, 95) });
    } else if (x.method === 'Network.eventSourceMessageReceived') {
      ev.push({ ph: PH, k: 'sse', v: (p.data || '').slice(0, 120) });
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

await send('Network.enable');
await send('Runtime.enable');
await send('Page.enable');

PH = 'baseline';
ev.push({ ph: 'ls', k: 'localStorage', v: await evl(`Object.keys(localStorage).map(k=>k+'='+(localStorage.getItem(k)||'').length+'B').join(', ')`) });
PH = 'play';
await evl(`(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'visible'});document.querySelector('video').play();return 1})()`);
await sleep(12000);
PH = 'seek';
await evl(`(()=>{const v=document.querySelector('video');v.currentTime=v.currentTime+25;return 1})()`);
await sleep(12000);
PH = 'pause';
await evl(`document.querySelector('video').pause()`);
await sleep(6000);
PH = 'hidden';
const t1 = await (async () => {
  const ver = await (await fetch(BASE + '/json/version')).json();
  const bws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r) => (bws.onopen = r));
  bws.send(JSON.stringify({ id: 1, method: 'Target.createTarget', params: { url: 'about:blank' } }));
  const got = await new Promise((r) => {
    const h = (e) => {
      const x = JSON.parse(e.data);
      if (x.id === 1) {
        bws.removeEventListener('message', h);
        r(x.result);
      }
    };
    bws.addEventListener('message', h);
  });
  await sleep(12000);
  bws.send(JSON.stringify({ id: 2, method: 'Target.closeTarget', params: { targetId: got.targetId } }));
  await sleep(800);
  bws.close();
  return got;
})();

const agg = {};
ev.forEach((e) => {
  const k = e.ph + ' | ' + e.k + ' | ' + (e.k === 'http' ? e.v : e.v.slice(0, 60));
  agg[k] = (agg[k] || 0) + 1;
});
console.log(JSON.stringify(agg, null, 1));
console.log('--- 明细(前25条) ---');
console.log(JSON.stringify(ev.slice(0, 25), null, 1));
ws.close();
process.exit(0);
