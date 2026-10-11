// 列出可见性相关监听器，并用 Function.prototype.toString 判定其行为
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const tab = (await (await fetch(BASE + '/json/list')).json())
  .filter((t) => t.type === 'page')
  .find((t) => (t.url + ' ' + t.title).includes(arg('--match', 'MyCourse/Study')));
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
await send('Runtime.enable');

const WATCH = ['visibilitychange', 'blur', 'focus', 'pagehide', 'mouseleave', 'selectionchange', 'copy', 'paste', 'contextmenu'];
const probe = async (label, expr) => {
  const { result: obj } = await send('Runtime.evaluate', { expression: expr, returnByValue: false });
  if (!obj || !obj.objectId) return { label, err: 'no objectId' };
  const r = await send('DOMDebugger.getEventListeners', { objectId: obj.objectId, depth: 0 });
  const all = (r.listeners || []).filter((l) => WATCH.includes(l.type));
  const out = [];
  for (const l of all) {
    let src = '';
    try {
      const s = await send('Runtime.callFunctionOn', {
        objectId: l.handler.objectId,
        functionDeclaration: 'function(){ try { return String(this).slice(0, 400) } catch (e) { return "ERR" } }',
        returnByValue: true,
      });
      src = s.result?.value || '';
    } catch (e) {
      src = 'ERR';
    }
    out.push({
      type: l.type,
      capture: !!l.capture,
      readsHidden: /document\.hidden|visibilityState/.test(src),
      callsPause: /\.pause\s*\(/.test(src),
      callsPlay: /\.play\s*\(/.test(src),
      usesTimer: /setInterval|setTimeout/.test(src),
      src,
    });
  }
  return { label, total: (r.listeners || []).length, watched: out };
};

const res = [];
res.push(await probe('document', 'document'));
res.push(await probe('window', 'window'));
res.push(await probe('video', 'document.querySelector("video")'));
console.log(JSON.stringify(res, null, 1));
ws.close();
process.exit(0);
