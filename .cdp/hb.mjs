// 进度上报心跳：分别在「前台」和「后台隐藏」两个窗口里记录所有 gateway 请求
//   node hb.mjs [--hidden 30]
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const HIDDEN_SEC = Number(arg('--hidden', 30));
let PHASE = 'warmup';
const tab = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page').find((t) => t.url.includes('MyCourse/Study'));
let seq = 0;
const pend = new Map();
const log = [];
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
    } else if (x.method === 'Network.requestWillBeSent' && x.params.request.url.includes('/gateway/')) {
      log.push({ t: Date.now(), phase: PHASE, url: x.params.request.url.replace('https://study.cqie.edu.cn', '').slice(0, 90), method: x.params.request.method, body: (x.params.request.postData || '').slice(0, 220) });
    }
  };
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pend.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
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
await bsend('Target.activateTarget', { targetId: tab.id });
// 保持上一轮的伪装，让视频在后台也能播
await send('Runtime.evaluate', {
  expression: `(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'visible'});document.querySelector('video').play();return 1})()`,
  returnByValue: true,
});
const st = async () => JSON.parse((await send('Runtime.evaluate', { expression: `JSON.stringify({t:+document.querySelector('video').currentTime.toFixed(1),paused:document.querySelector('video').paused,vis:document.visibilityState})`, returnByValue: true })).result.value);

await new Promise((r) => setTimeout(r, 2000));
PHASE = '前台';
const s0 = await st();
await new Promise((r) => setTimeout(r, 15000));
const s1 = await st();
log.length && log.forEach((l) => (l.phase = '前台'));

const t1 = await bsend('Target.createTarget', { url: 'about:blank' });
await new Promise((r) => setTimeout(r, 2000));
const mark = log.length;
PHASE = '后台';
const b0 = await st();
await new Promise((r) => setTimeout(r, HIDDEN_SEC * 1000));
const b1 = await st();
const bgReqs = log.slice(mark);
bgReqs.forEach((l) => (l.phase = '后台'));

await bsend('Target.closeTarget', { targetId: t1.targetId });
await bsend('Target.activateTarget', { targetId: tab.id });

const uniq = (arr) => {
  const m = new Map();
  arr.forEach((r) => {
    const k = r.method + ' ' + r.url;
    if (!m.has(k)) m.set(k, { ...r, n: 0 });
    m.get(k).n++;
  });
  return [...m.values()];
};
console.log(
  JSON.stringify(
    {
      前台: { video: `${s0.t}→${s1.t} (+${(s1.t - s0.t).toFixed(1)}s)`, 请求: uniq(log.filter((l) => l.phase === '前台')) },
      后台: { video: `${b0.t}→${b1.t} (+${(b1.t - b0.t).toFixed(1)}s)`, vis: b0.vis, 请求: uniq(bgReqs) },
    },
    null,
    1
  )
);
bws.close();
ws.close();
process.exit(0);
