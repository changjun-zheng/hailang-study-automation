// 从站点自己已加载的 JS chunk 里，只抽取「像后端接口路径的字符串」并去重打印。
// 页面侧逻辑放在 scan-page.js（避免跨上下文插值的转义地狱）。
//   node .cdp/scan-endpoints.mjs [正则关键词]      默认 xercise
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const KEEP = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id;
const KW = process.argv[2] || 'xercise';

const full = (await (await fetch(BASE + '/json/list')).json()).find((t) => t.id === KEEP && t.type === 'page');
if (!full) {
  console.log('找不到标签页');
  process.exit(1);
}
const ws = new WebSocket(full.webSocketDebuggerUrl);
const pend = new Map();
let seq = 0;
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && pend.has(x.id)) {
    const p = pend.get(x.id);
    pend.delete(x.id);
    p(x.result);
  }
};
const send = (method, params) =>
  new Promise((res) => {
    const id = ++seq;
    pend.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });

const EXPR = 'window.__SCAN_KW=' + JSON.stringify(KW) + ';' + fs.readFileSync(path.join(ROOT, '.cdp', 'scan-page.js'), 'utf8');
const r = JSON.parse((await send('Runtime.evaluate', { expression: EXPR, returnByValue: true, awaitPromise: true })).result?.value || '{}');
console.log(`扫了 ${r.chunks} 个已加载的 chunk，关键词 /${r.kw}/i，命中 ${r.hits.length} 个路径字符串：`);
for (const h of r.hits) console.log('  ' + h);
if (r.errs && r.errs.length) console.log('拉取失败：' + r.errs.join(', '));
ws.close();
process.exit(0);
