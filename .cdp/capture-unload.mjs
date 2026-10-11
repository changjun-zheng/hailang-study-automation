// 验「离开页面时才上报」这条通道：挂上 Network，然后原地重载，把重载前后 20 秒里的请求全列出来。
// 只看 URL 和方法，不打印任何请求头（里面有 token）。
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const fs = await import('node:fs');
const path = await import('node:path');
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEEP = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id;

const full = (await (await fetch(BASE + '/json/list')).json()).find((t) => t.id === KEEP);
if (!full) {
  console.error('找不到 runner 标签页');
  process.exit(1);
}
const ws = new WebSocket(full.webSocketDebuggerUrl);
const pend = new Map();
let seq = 0;
await new Promise((r) => (ws.onopen = r));
const hits = [];
let mark = 0;
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && pend.has(x.id)) {
    const p = pend.get(x.id);
    pend.delete(x.id);
    x.error ? p.rej(new Error(x.error.message)) : p.res(x.result);
    return;
  }
  if (x.method === 'Network.requestWillBeSent') {
    const u = x.params.request.url;
    if (/\.(js|css|png|jpe?g|gif|svg|woff2?|ttf|ico|map)(\?|$)/i.test(u)) return;
    hits.push({ at: Math.round((Date.now() - mark) / 1000), m: x.params.request.method, u: u.replace('https://', '').slice(0, 120), type: x.params.type, hasBody: !!x.params.request.postData });
  }
};
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pend.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });

await send('Network.enable');
await send('Page.enable');
mark = Date.now();
hits.push({ at: 0, m: '--- 即将原地重载 ---', u: '', type: '', hasBody: false });
await send('Page.reload', { ignoreCache: false });
await sleep(20000);
console.log('重载前后 20 秒内的全部请求：');
for (const h of hits) console.log(`  ${String(h.at).padStart(4)}s [${h.m}] ${h.type || ''} ${h.hasBody ? '有请求体 ' : ''}${h.u}`);
const odd = hits.filter((h) => !/myCourseDetails|progressDetails|^---/.test(h.u) && h.u && !/\.(mp4|m3u8)/i.test(h.u));
console.log(`\n除页面常规轮询/媒体之外的请求共 ${odd.length} 条`);
ws.close();
process.exit(0);
