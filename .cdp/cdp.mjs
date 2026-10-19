// 通用 CDP 客户端（零依赖，Node>=21 自带 WebSocket）
//   node cdp.mjs --list
//   node cdp.mjs --eval "<js>" [--match 关键字] [--raw]
//   node cdp.mjs --shot out.png [--match 关键字]
//   node cdp.mjs --nav "<url>" [--match 关键字]
//   node cdp.mjs --activate [--match 关键字]
// 连的是本机 dedicated profile Chrome（--user-data-dir 指向 <你的主目录>\.hailang-chrome-profile）
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const has = (n) => process.argv.includes(n);
const MATCH = arg('--match', 'study.cqie');

const pages = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
if (has('--list')) {
  pages.forEach((t) => console.log(`${t.id.slice(0, 10)} | ${t.title.slice(0, 45)} | ${t.url.slice(0, 110)}`));
  process.exit(0);
}
// --id 前缀定位，避免和 runner 抢同一个标签页
const byId = arg('--id', '');
const tab = byId
  ? pages.find((t) => t.id.startsWith(byId))
  : pages.find((t) => (t.url + ' ' + t.title).includes(MATCH)) || pages[0];
if (!tab) {
  console.log('没有匹配的页面标签');
  process.exit(1);
}
let seq = 0;
const pend = new Map();
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
    }
  };
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pend.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });

if (has('--activate')) {
  const v = await (await fetch(BASE + '/json/version')).json();
  const bws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise((r) => (bws.onopen = r));
  bws.send(JSON.stringify({ id: 9999, method: 'Target.activateTarget', params: { targetId: tab.id } }));
  await new Promise((r) => setTimeout(r, 800));
  bws.close();
  await send('Page.enable').catch(() => {});
  await send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  console.log('已激活:', tab.title.slice(0, 40));
} else if (has('--nav')) {
  await send('Page.enable');
  await send('Page.navigate', { url: arg('--nav') });
  await new Promise((r) => setTimeout(r, 4000));
  const now = (await (await fetch(BASE + '/json/list')).json()).find((x) => x.id === tab.id);
  console.log('now:', (now?.url || '?').slice(0, 140), '|', now?.title);
} else if (has('--shot')) {
  await send('Page.enable');
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const fs = await import('node:fs');
  fs.writeFileSync(arg('--shot'), Buffer.from(data, 'base64'));
  console.log('wrote', arg('--shot'), '|', tab.title.slice(0, 40));
} else if (has('--eval')) {
  const expr = arg('--eval');
  const r = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (r.exceptionDetails) console.log('EXCEPTION: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text || '').slice(0, 900));
  const v = r.result?.value;
  const s = typeof v === 'string' ? v : JSON.stringify(v, null, has('--raw') ? 0 : 1);
  console.log((s ?? 'undefined').slice(0, has('--raw') ? 400000 : 8000));
}
ws.close();
process.exit(0);
