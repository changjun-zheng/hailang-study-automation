// 把 runner 那个 Chrome 窗口最小化（或还原）。最小化后仍可播放是本项目的硬前提。
//   node .cdp/minimize.mjs            最小化
//   node .cdp/minimize.mjs --restore  还原成 normal
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STATE = process.argv.includes('--restore') ? 'normal' : process.argv.includes('--park') ? 'park' : 'minimized';
const LOCK = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id;

const ver = await (await fetch(BASE + '/json/version')).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
const pend = new Map();
let seq = 0;
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(new Error('ws 失败'));
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

const { windowId } = await send('Browser.getWindowForTarget', { targetId: LOCK });
if (STATE === 'park') {
  // 先脱离 minimized/maximized（CDP 不允许 windowState 与坐标同时给），再挪到屏幕外
  await send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
  await sleep(400);
  await send('Browser.setWindowBounds', { windowId, bounds: { left: -30000, top: -30000, width: 1280, height: 800 } });
} else {
  await send('Browser.setWindowBounds', { windowId, bounds: { windowState: STATE } });
}
await sleep(600);
const b = await send('Browser.getWindowBounds', { windowId });
const rv = await (async () => {
  const pages = await (await fetch(BASE + '/json/list')).json();
  const t = pages.find((x) => x.id === LOCK);
  if (!t) return '?';
  const pws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (pws.onopen = r));
  const out = await new Promise((res) => {
    pws.onmessage = (m) => {
      const x = JSON.parse(m.data);
      if (x.id === 99) res(x.result?.result?.value);
    };
    pws.send(JSON.stringify({ id: 99, method: 'Runtime.evaluate', params: { expression: `(()=>{try{return Object.getOwnPropertyDescriptor(Document.prototype,'visibilityState').get.call(document)}catch(e){return '?'}})()`, returnByValue: true } }));
  });
  pws.close();
  return out;
})();
console.log(`窗口 ${windowId} → ${b.bounds.windowState} @ (${b.bounds.left},${b.bounds.top}) ${b.bounds.width}x${b.bounds.height}；页面真实可见性=${rv}`);
ws.close();
process.exit(0);
