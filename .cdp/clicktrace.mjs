// 定位元素→真实点击→记录期间所有 gateway 请求（找答题/提交接口）
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const MATCH = arg('--match', 'MyPractice');
const ROW = arg('--row', '软件系统分析与设计');
const BTN = arg('--btn', '查看');
const WAIT = Number(arg('--wait', 9000));

const tab = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page').find((t) => t.url.includes(MATCH));
let seq = 0;
const pend = new Map();
const ev = [];
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
      return;
    }
    if (x.method === 'Network.requestWillBeSent' && x.params.request.url.includes('/gateway/')) {
      ev.push({ id: x.params.requestId, m: x.params.request.method, u: x.params.request.url.replace('https://study.cqie.edu.cn', ''), body: (x.params.request.postData || '').slice(0, 900) });
    }
    if (x.method === 'Network.loadingFinished') {
      const e = ev.find((q) => q.id === x.params.requestId);
      if (e) e.done = true;
    }
  };
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pend.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evl = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send('Network.enable');
await send('Runtime.enable');
await send('Page.enable');
// 后台标签页里合成点击不会触发前端 handler，必须先把这个标签页带到前台
{
  const ver = await (await fetch(BASE + '/json/version')).json();
  const bws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((r) => (bws.onopen = r));
  bws.send(JSON.stringify({ id: 1, method: 'Target.activateTarget', params: { targetId: tab.id } }));
  await new Promise((r) => setTimeout(r, 900));
  bws.close();
}

const loc = arg('--cx', '') && arg('--cy', '') ? JSON.stringify({ x: Number(arg('--cx')), y: Number(arg('--cy')), txt: '(按坐标点击)' }) : await evl(`(async () => {
  if (!${JSON.stringify(BTN)}) {
    const cs = [...document.querySelectorAll('div,li,tr,span')].filter(e => (e.innerText||'').includes(${JSON.stringify(ROW)}) && (e.innerText||'').length < 200);
    if (!cs.length) return 'NOROW';
    const el = cs.sort((a,b)=>(a.offsetWidth*a.offsetHeight)-(b.offsetWidth*b.offsetHeight))[0];
    const r = el.getBoundingClientRect();
    if (!r.width) return 'NOBOX';
    return JSON.stringify({x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2), txt: el.innerText.replace(/\\s+/g,' ').slice(0,90)});
  }
  const rows = [...document.querySelectorAll('div,li,tr')].filter(e => (e.innerText||'').includes(${JSON.stringify(ROW)}) && (e.innerText||'').includes(${JSON.stringify(BTN)}) && (e.innerText||'').length < 400);
  if (!rows.length) return 'NOROW';
  const row = rows.sort((a,b)=>a.innerText.length-b.innerText.length)[0];
  const b = [...row.querySelectorAll('*')].find(e => (e.innerText||'').trim() === ${JSON.stringify(BTN)} && e.children.length === 0);
  if (!b) return 'NOBTN';
  // 目标可能在视口外（列表页 y 会超过 innerHeight），必须先滚进来再取坐标
  b.scrollIntoView({ block: 'center' });
  await new Promise(r => setTimeout(r, 350));
  const r = b.getBoundingClientRect();
  return JSON.stringify({x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2), txt: row.innerText.replace(/\\s+/g,' ').slice(0,90)});
})()`);
console.log('定位:', loc);
if (!loc || loc[0] !== '{') {
  process.exit(1);
}
const { x, y } = JSON.parse(loc);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
await sleep(WAIT);

const targets = ev.filter((e) => /gateway\//.test(e.u));
const bodies = [];
for (const t of targets.slice(0, 6)) {
  try {
    const b = await send('Network.getResponseBody', { requestId: t.id });
    bodies.push({ u: t.u, m: t.m, req: t.body, res: (b.base64Encoded ? '<b64>' : b.body || '').slice(0, 1500) });
  } catch (e) {
    bodies.push({ u: t.u, m: t.m, req: t.body, err: String(e).slice(0, 60) });
  }
}
console.log('全部请求:', JSON.stringify(ev.map((e) => e.m + ' ' + e.u), null, 1));
console.log('答题相关:', JSON.stringify(bodies, null, 1));
console.log('当前URL:', await evl('location.href'));
ws.close();
process.exit(0);
