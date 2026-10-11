// 真后台跑完整条视频，记录所有 gateway 写入请求 + 结束时进度接口返回
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const tab = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page').find((t) => t.url.includes('MyCourse/Study'));
let seq = 0;
const pend = new Map();
const reqs = [];
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
    if (x.method === 'Network.requestWillBeSent' && x.params.request.url.includes('/gateway/')) {
      const u = x.params.request.url.replace('https://study.cqie.edu.cn', '');
      if (x.params.request.method !== 'GET' || /progress|record|study|unit|task|complete|time/i.test(u)) {
        reqs.push({ at: new Date().toISOString().slice(11, 19), m: x.params.request.method, u: u.slice(0, 95), body: (x.params.request.postData || '').slice(0, 300) });
      }
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
const ver = await (await fetch(BASE + '/json/version')).json();
const bws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
let bid = 9000;
const bsend = (method, params) =>
  new Promise((res) => {
    const id = ++bid;
    const h = (ev) => {
      const x = JSON.parse(ev.data);
      if (x.id === id) {
        bws.removeEventListener('message', h);
        res(x.result);
      }
    };
    bws.addEventListener('message', h);
    bws.send(JSON.stringify({ id, method, params }));
  });

await send('Network.enable');
await send('Page.enable');
await send('Runtime.evaluate', {
  expression: `(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'visible'});window.__ev=[];const v=document.querySelector('video');['pause','ended','timeupdate'].forEach(()=>{});v.addEventListener('ended',()=>window.__ev.push('ended@'+v.currentTime));v.play();return 1})()`,
  returnByValue: true,
});
await bsend('Target.activateTarget', { targetId: tab.id });
await sleep(1500);
const extra = await bsend('Target.createTarget', { url: 'about:blank' });
await sleep(2000);
console.log('已切到真后台, 起始:', await evl(`JSON.stringify({t:+document.querySelector('video').currentTime.toFixed(1),d:+document.querySelector('video').duration.toFixed(1),vis:document.visibilityState,paused:document.querySelector('video').paused})`));

const t0 = Date.now();
let last = null;
while (Date.now() - t0 < 560000) {
  await sleep(20000);
  last = await evl(`JSON.stringify({t:+document.querySelector('video').currentTime.toFixed(1),paused:document.querySelector('video').paused,vis:document.visibilityState,ev:window.__ev.join('|')})`);
  console.log('  +' + Math.round((Date.now() - t0) / 1000) + 's', last);
  const o = JSON.parse(last);
  if (o.ev.includes('ended') || o.paused) break;
}
await bsend('Target.closeTarget', { targetId: extra.targetId });
await bsend('Target.activateTarget', { targetId: tab.id });
await sleep(2500);
console.log('结束态:', last);
console.log('写入请求:', JSON.stringify(reqs.slice(-14), null, 1));
console.log('进度接口:', await evl(`fetch('/gateway/system/orgStudent/progressDetails?studentId=YOUR_STUDENT_ID&id=4fafa68754ee9872feb67b4cda5f2c4f',{headers:{Authorization:localStorage.getItem('token2')}}).then(r=>r.text()).then(s=>s.slice(0,700))`));
bws.close();
ws.close();
process.exit(0);
