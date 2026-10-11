// 跑 .cdp/mute-unit-test.html 的回归测试：把油猴脚本注入到一个本地 fixture 页，
// 让它按「同一条视频 / 他亲手改 / 换下一条」三种情形被操作，读回断言结果。
// 不碰 study.cqie.edu.cn，也不碰 runner 的标签页。
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const fs = await import('node:fs');
const path = await import('node:path');
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'hailang-background-play.user.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAGE = 'http://127.0.0.1:8887/.cdp/mute-unit-test.html';

const mk = async (u) => {
  const ws = new WebSocket(u);
  const inflight = new Map();
  let seq = 0;
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('ws 失败'));
    ws.onmessage = (m) => {
      const x = JSON.parse(m.data);
      if (x.id && inflight.has(x.id)) {
        const p = inflight.get(x.id);
        inflight.delete(x.id);
        x.error ? p.rej(new Error(x.error.message)) : p.res(x.result);
      }
    };
  });
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const id = ++seq;
      inflight.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evl = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;
  return { ws, send, evl };
};

const ver = await (await fetch(BASE + '/json/version')).json();
const B = await mk(ver.webSocketDebuggerUrl);
const { targetId } = await B.send('Target.createTarget', { url: 'about:blank' });
let wsUrl = null;
for (let i = 0; i < 25 && !wsUrl; i++) {
  await sleep(400);
  wsUrl = (await (await fetch(BASE + '/json/list')).json()).find((t) => t.id === targetId)?.webSocketDebuggerUrl;
}
if (!wsUrl) {
  console.error('测试标签页连不上');
  process.exit(1);
}
const P = await mk(wsUrl);
await P.send('Page.enable');
await P.send('Runtime.enable');
await P.send('Page.addScriptToEvaluateOnNewDocument', { source: SRC });
await P.send('Page.navigate', { url: PAGE });
await sleep(2500);
const alive = await P.evl(`typeof window.__scenario === 'function'`);
if (alive !== true) {
  console.error('fixture 页没加载成功（本地 8887 服务在跑吗？），本次不判定');
  await B.send('Target.closeTarget', { targetId });
  process.exit(1);
}
const r = await P.evl(`window.__scenario()`);
if (!r) {
  console.error('场景没返回结果');
  await B.send('Target.closeTarget', { targetId });
  process.exit(1);
}
for (const s of r.steps) console.log(`${s.ok ? '✓' : '✗'} ${s.name}  实测 ${s.got}`);
console.log(r.pass ? `\n全部 ${r.steps.length} 条通过` : `\n有 ${r.steps.filter((s) => !s.ok).length} 条不通过`);
await B.send('Target.closeTarget', { targetId });
P.ws.close();
B.ws.close();
process.exit(r.pass ? 0 : 1);
