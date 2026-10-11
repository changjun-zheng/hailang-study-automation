// 只读录制器：挂在当前 study 标签页上，把真人操作期间站点发出的每个 gateway 请求记到文件。
//   node .cdp/record-gateway.mjs [秒数]        默认 1200 秒后自动收工
// 不做任何点击、不改任何页面状态，只开 Network 域看事件。
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const OUT = path.join(ROOT, '.cdp', 'human-exercise-chain.txt');
const LIMIT = Number(process.argv[2] || 1200) * 1000;
const NAV = process.env.NAV_URL || '';

const pages = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = pages.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
const pend = new Map();
let seq = 0;
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
const inflight = new Map();
const log = (s) => { fs.appendFileSync(OUT, s + String.fromCharCode(10)); };

ws.onmessage = (e) => {
  const x = JSON.parse(e.data);
  if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); return; }
  if (x.method === 'Network.requestWillBeSent') {
    const q = x.params.request;
    if (!q.url.includes('/gateway/')) return;
    inflight.set(x.params.requestId, { m: q.method, u: decodeURIComponent(q.url).replace('https://study.cqie.edu.cn', ''), body: q.postData || '', t: new Date().toTimeString().slice(0, 8) });
  } else if (x.method === 'Network.responseReceived') {
    const r = inflight.get(x.params.requestId);
    if (r) r.status = x.params.response.status;
  } else if (x.method === 'Network.loadingFinished' || x.method === 'Network.loadingFailed') {
    const r = inflight.get(x.params.requestId);
    if (!r) return;
    inflight.delete(x.params.requestId);
    log(`${r.t} ${r.status || 'FAIL'} ${r.m} ${r.u}${r.body ? '  body=' + r.body.slice(0, 300) : ''}`);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });

await send('Page.enable');
await send('Network.enable', { maxTotalBufferSize: 5000000, maxResourceBufferSize: 2000000 });
if (NAV) { await send('Page.navigate', { url: NAV }); log('# 已导航到目标页'); }
log(`# ===== 录制开始 ${new Date().toISOString()} 页面=${page.url.slice(0, 90)}`);
console.log('录制中，输出到 .cdp/human-exercise-chain.txt，' + LIMIT / 60000 + ' 分钟后自动收工');

const started = Date.now();
const timer = setInterval(() => {
  if (Date.now() - started > LIMIT || fs.existsSync(path.join(ROOT, '.cdp', 'record-stop'))) {
    clearInterval(timer);
    log('# ===== 录制结束');
    console.log('收工');
    ws.close();
    process.exit(0);
  }
}, 2000);
