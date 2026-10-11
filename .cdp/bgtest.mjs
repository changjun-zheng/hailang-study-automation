// 后台播放对照实验：分阶段采样 video 状态
//   node bgtest.mjs [--patch "<注入的补丁JS>"] [--label 未打补丁]
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const MATCH = arg('--match', 'MyCourse/Study');
const LABEL = arg('--label', '未打补丁');
const PATCH = arg('--patch', '');

const jfetch = async (p) => (await fetch(BASE + p)).json();
const pages = (await jfetch('/json/list')).filter((t) => t.type === 'page');
const tab = pages.find((t) => (t.url + ' ' + t.title).includes(MATCH));
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

const activate = async () => {
  await bsend('Target.activateTarget', { targetId: tab.id });
  await send('Page.enable').catch(() => {});
  await send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
};

const SAMPLE = `(() => { const v = document.querySelector('video'); if (!v) return 'NOVIDEO';
  return JSON.stringify({ paused: v.paused, t: +v.currentTime.toFixed(1), d: +(v.duration||0).toFixed(1), r: v.playbackRate,
    vis: document.visibilityState, hid: document.hidden, focus: document.hasFocus() }); })()`;
const sample = async () => JSON.parse((await send('Runtime.evaluate', { expression: SAMPLE, returnByValue: true })).result.value);

const phase = async (name, ms) => {
  const rows = [];
  const n = Math.max(2, Math.round(ms / 2500));
  for (let i = 0; i < n; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    try {
      rows.push(await sample());
    } catch (e) {
      rows.push({ err: String(e).slice(0, 40) });
    }
  }
  const a = rows[0],
    b = rows[rows.length - 1];
  const advanced = a && b && typeof b.t === 'number' ? +(b.t - a.t).toFixed(1) : 'NA';
  console.log(`[${LABEL}] ${name}: 时间轴前进 ${advanced}s | 首样 ${JSON.stringify(a)} | 末样 ${JSON.stringify(b)}`);
  return advanced;
};

await activate();
if (PATCH) {
  await send('Runtime.evaluate', { expression: PATCH, returnByValue: true });
  console.log('补丁已注入:', PATCH.slice(0, 60) + '...');
}
// 起播
await send('Runtime.evaluate', { expression: `document.querySelector('video').play().then(()=>1).catch(e=>'play失败:'+e.name)`, returnByValue: true, awaitPromise: true, userGesture: true });
await new Promise((r) => setTimeout(r, 1200));

console.log('--- 阶段1 前台 ---');
await phase('前台', 6000);

console.log('--- 阶段2 真·切后台（新开标签压在上面）---');
const nt = await bsend('Target.createTarget', { url: 'about:blank' });
await new Promise((r) => setTimeout(r, 1500));
await phase('切后台', 12000);
await bsend('Target.closeTarget', { targetId: nt.targetId });
await activate();

console.log('--- 阶段3 真·最小化窗口 ---');
try {
  const w = await bsend('Browser.getWindowForTarget', { targetId: tab.id });
  await bsend('Browser.setWindowBounds', { windowId: w.windowId, bounds: { windowState: 'minimized' } });
  await new Promise((r) => setTimeout(r, 1500));
  await phase('最小化', 12000);
  await bsend('Browser.setWindowBounds', { windowId: w.windowId, bounds: { windowState: 'normal' } });
  await activate();
} catch (e) {
  console.log('最小化这步没做成:', String(e).slice(0, 90));
}

console.log('--- 阶段4 切后台 + 窗口失焦（模拟你切去写代码）---');
const nt2 = await bsend('Target.createTarget', { url: 'about:blank' });
await new Promise((r) => setTimeout(r, 1500));
await phase('失焦后台', 10000);
await bsend('Target.closeTarget', { targetId: nt2.targetId });
await activate();

bws.close();
ws.close();
process.exit(0);
