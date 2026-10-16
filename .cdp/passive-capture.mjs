// 被动抓包：附着在你当前打开的学习页，记录 3 分钟内的所有 XHR/Fetch（不按 URL 过滤，避免自设盲区）。
// 期间请你点一个「知识练习」入口。脚本只读，不点击、不提交。
//   node .cdp/passive-capture.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const OUT = path.join(ROOT, '.cdp', 'passive-capture.txt');
const SECONDS = Number(process.argv[2] || 180);

const all = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && t.url.includes('study.cqie.edu.cn'));
if (!all.length) { console.log('没有 study 标签页'); process.exit(1); }
const rows = []; const byId = new Map(); const seen = new Set();
let done = false;

for (const tab of all) {
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; ws.onerror = r; });
  ws.onmessage = (e) => {
    const x = JSON.parse(e.data);
    if (x.method === 'Network.requestWillBeSent') {
      const typ = x.params.type || '';
      if (!/^(XHR|Fetch)$/i.test(typ)) return;
      const u = decodeURIComponent(String(x.params.request.url));
      byId.set(x.params.requestId, { tab: tab.url.slice(0, 60), m: x.params.request.method, u: u.replace('https://study.cqie.edu.cn', ''), body: x.params.request.postData || '' });
    } else if (x.method === 'Network.responseReceived') {
      const r = byId.get(x.params.requestId); if (r) r.status = x.params.response.status;
    } else if (x.method === 'Network.loadingFinished') {
      const r = byId.get(x.params.requestId);
      if (r && !seen.has(r.m + r.u)) { seen.add(r.m + r.u); rows.push(r); fs.writeFileSync(OUT, rows.map((q) => `${q.m} ${q.u}\n   body=${q.body || '(无)'}\n`).join('')); }
    }
  };
  await new Promise((res) => { ws.send(JSON.stringify({ id: 1, method: 'Network.enable', params: { maxTotalBufferSize: 50000000 } })); setTimeout(res, 300); });
}

console.log(`开始抓包 ${SECONDS} 秒 —— 请在网页上点一个「知识练习(1题)」。`);
console.log(`实时写入：${OUT}`);
const t0 = Date.now();
await new Promise((r) => { const iv = setInterval(() => { if (Date.now() - t0 > SECONDS * 1000) { clearInterval(iv); r(); } }, 1000); });
console.log(`\n抓到 ${rows.length} 个 XHR/Fetch：`);
for (const r of rows) console.log(`  ${r.m} ${r.u.slice(0, 110)}\n     body=${(r.body || '(无)').slice(0, 260)}`);
process.exit(0);
