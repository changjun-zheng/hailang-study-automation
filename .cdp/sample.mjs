// 采样视频状态；--hide 先开一个空白标签把页面压到真后台，--close 收尾关掉
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const has = (n) => process.argv.includes(n);
const SECS = Number(arg('--secs', 60));
const TAB = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page').find((t) => t.url.includes('MyCourse/Study'));
const HIDE_ID = arg('--hideid', '');
let seq = 0;
const pend = new Map();
const ws = new WebSocket(TAB.webSocketDebuggerUrl);
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
const ver = await (await fetch(BASE + '/json/version')).json();
const bws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
let bid = 500;
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

if (has('--hide')) {
  const t = await bsend('Target.createTarget', { url: 'about:blank' });
  console.log('已开空白标签压后台 targetId=' + t.targetId);
  await sleep(2500);
} else if (HIDE_ID) {
  await bsend('Target.closeTarget', { targetId: HIDE_ID });
  await bsend('Target.activateTarget', { targetId: TAB.id });
  console.log('已关闭遮挡标签');
  bws.close();
  ws.close();
  process.exit(0);
}

const rows = [];
for (let i = 0; i < Math.ceil(SECS / 20); i++) {
  await sleep(20000);
  const s = await evl(`(()=>{const v=document.querySelector('video');if(!v)return 'NOVIDEO';const d=Object.getOwnPropertyDescriptor(document,'hidden');return JSON.stringify({t:+v.currentTime.toFixed(1),d:+(v.duration||0).toFixed(1),paused:v.paused,vis:document.visibilityState,spoofed:!!d})})()`);
  rows.push(s);
  console.log('  +' + (i + 1) * 20 + 's', s);
  const o = typeof s === 'string' && s[0] === '{' ? JSON.parse(s) : {};
  if (o.paused) {
    console.log('⚠ 被暂停了，停止采样');
    break;
  }
}
bws.close();
ws.close();
process.exit(0);
