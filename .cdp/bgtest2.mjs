// 后台播放对照实验 v2 —— 不做任何 focus/lifecycle 仿真，避免把要测的条件测没
//   node bgtest2.mjs [--patch "<JS>"] [--label 未打补丁]
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const MATCH = arg('--match', 'MyCourse/Study');
const LABEL = arg('--label', '未打补丁');
const PATCH = arg('--patch', '');

const jfetch = async (p) => (await fetch(BASE + p)).json();
const tab = (await jfetch('/json/list')).filter((t) => t.type === 'page').find((t) => (t.url + ' ' + t.title).includes(MATCH));
if (!tab) {
  console.log('没找到 Study 标签页');
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
const ver = await jfetch('/json/version');
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

// 上一轮的 focus 仿真是 per-CDP-session 的，进程退出即失效；这里只是保险
await send('Emulation.setFocusEmulationEnabled', { enabled: false }).catch(() => {});

const SAMPLE = `(() => { const v = document.querySelector('video'); if (!v) return 'NOVIDEO';
  return JSON.stringify({ paused: v.paused, t: +v.currentTime.toFixed(1), vis: document.visibilityState, hid: document.hidden, focus: document.hasFocus() }); })()`;
const sample = async () => {
  try {
    return JSON.parse((await send('Runtime.evaluate', { expression: SAMPLE, returnByValue: true })).result.value);
  } catch (e) {
    return { err: String(e).slice(0, 50) };
  }
};
const phase = async (name, ms) => {
  const rows = [];
  for (let i = 0; i < Math.max(2, Math.round(ms / 2500)); i++) {
    await new Promise((r) => setTimeout(r, 2500));
    rows.push(await sample());
  }
  const a = rows[0],
    b = rows[rows.length - 1];
  const adv = a.t !== undefined && b.t !== undefined ? +(b.t - a.t).toFixed(1) : 'NA';
  const cond = rows.map((r) => r.vis + (r.focus ? '/foc' : '/-')).join(' ');
  console.log(`[${LABEL}] ${name} → 前进 ${adv}s | ${JSON.stringify(b)} | 条件序列: ${cond}`);
  return { adv, last: b };
};

await bsend('Target.activateTarget', { targetId: tab.id });
if (PATCH) {
  await send('Runtime.evaluate', { expression: PATCH, returnByValue: true });
  console.log(`[${LABEL}] 已注入补丁`);
}
await send('Runtime.evaluate', { expression: `document.querySelector('video').play().then(()=>'ok').catch(e=>'fail:'+e.name)`, returnByValue: true, awaitPromise: true, userGesture: true });
await new Promise((r) => setTimeout(r, 1500));

await phase('A 前台基线', 6000);

const t1 = await bsend('Target.createTarget', { url: 'about:blank' });
await new Promise((r) => setTimeout(r, 2000));
await phase('B 切到别的标签页', 14000);
await bsend('Target.closeTarget', { targetId: t1.targetId });
await bsend('Target.activateTarget', { targetId: tab.id });
await new Promise((r) => setTimeout(r, 1500));

const w = await bsend('Browser.getWindowForTarget', { targetId: tab.id });
await bsend('Browser.setWindowBounds', { windowId: w.windowId, bounds: { windowState: 'minimized' } });
await new Promise((r) => setTimeout(r, 2000));
await phase('C 最小化整个窗口', 14000);
await bsend('Browser.setWindowBounds', { windowId: w.windowId, bounds: { windowState: 'normal' } });
await bsend('Target.activateTarget', { targetId: tab.id });

bws.close();
ws.close();
process.exit(0);
