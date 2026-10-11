// 机制定位：页面在「看不见」的时候，requestAnimationFrame 还跑不跑、播放器还发不发上报。
// 全程不弹窗口：先按现状测，再把窗口挪到屏幕外测，最后还原。
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOCK = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id;

const ver = await (await fetch(BASE + '/json/version')).json();
const bw = new WebSocket(ver.webSocketDebuggerUrl);
const bp = new Map();
let bseq = 0;
await new Promise((r) => (bw.onopen = r));
const bsend = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++bseq;
    bp.set(id, { res, rej });
    bw.send(JSON.stringify({ id, method, params }));
  });
bw.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && bp.has(x.id)) {
    const p = bp.get(x.id);
    bp.delete(x.id);
    x.error ? p.rej(new Error(x.error.message)) : p.res(x.result);
  }
};

const pages = await (await fetch(BASE + '/json/list')).json();
const t = pages.find((x) => x.id === LOCK && x.type === 'page');
const ws = new WebSocket(t.webSocketDebuggerUrl);
const pend = new Map();
let seq = 0;
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && pend.has(x.id)) {
    const p = pend.get(x.id);
    pend.delete(x.id);
    x.error ? p.rej(new Error(x.error.message)) : p.res(x.result);
  }
};
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pend.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evl = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.value;

const { windowId } = await bsend('Browser.getWindowForTarget', { targetId: LOCK });
const orig = (await bsend('Browser.getWindowBounds', { windowId })).bounds;
console.log('当前窗口:', JSON.stringify(orig));

const reqs = [];
await send('Network.enable');
await send('Runtime.enable');
ws.onmessage = ((base) => (m) => {
  const x = JSON.parse(m.data);
  if (x.method === 'Network.requestWillBeSent' && !/\.(js|css|png|jpe?g|svg|woff2?|ico|map)(\?|$)/i.test(x.params.request.url)) {
    reqs.push(x.params.request.url.replace('https://study.cqie.edu.cn', '').slice(0, 90));
  }
  base.call(ws, m);
})(ws.onmessage);

async function measure(label) {
  reqs.length = 0;
  // rAF 计数器 + timeupdate 计数器各跑 6 秒
  const r = await evl(
    `(async()=>{const v=document.querySelector('video');let raf=0,tu=0;
      const stop=performance.now()+6000;
      const loop=()=>{raf++;if(performance.now()<stop)requestAnimationFrame(loop)};
      requestAnimationFrame(loop);
      const h=()=>{tu++};v&&v.addEventListener('timeupdate',h);
      const t0=v?v.currentTime:0;
      await new Promise(r=>setTimeout(r,6100));
      v&&v.removeEventListener('timeupdate',h);
      let rv='?';try{rv=Object.getOwnPropertyDescriptor(Document.prototype,'visibilityState').get.call(document)}catch(e){}
      return JSON.stringify({rv,rafTicks:raf,timeUpdates:tu,advanced:+((v?v.currentTime:0)-t0).toFixed(1),paused:v?v.paused:null})})()`
  );
  console.log(`\n[${label}] ${r}`);
  console.log(`[${label}] 这 6 秒里的网络请求: ${reqs.length ? [...new Set(reqs)].join(' | ') : '（一个都没有）'}`);
}

await measure('现状（' + orig.windowState + '）');

await bsend('Browser.setWindowBounds', { windowId, bounds: { left: -30000, top: -30000, width: 1280, height: 800, windowState: 'normal' } });
await sleep(2500);
await measure('挪到屏幕外 -30000,-30000');

await bsend('Browser.setWindowBounds', { windowId, bounds: orig });
await sleep(1500);
console.log('\n窗口已还原为', (await bsend('Browser.getWindowBounds', { windowId })).bounds.windowState);
ws.close();
bw.close();
process.exit(0);
