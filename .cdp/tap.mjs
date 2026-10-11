// 真实鼠标点击（CDP Input.dispatchMouseEvent，trusted）
//   node tap.mjs --sel ".itemContent" --text 软件系统分析与设计 [--cx 400 --cy 300]
//   需要 hover 才出现的按钮：加 --hover-text 课程名（先把鼠标移上去再定位目标）
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const has = (n) => process.argv.includes(n);
const MATCH = arg('--match', 'study.cqie');
const SEL = arg('--sel', '');
const TXT = arg('--text', '');

const pages = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const tab = pages.find((t) => (t.url + ' ' + t.title).includes(MATCH)) || pages[0];
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

// 先把标签页拉到前台，否则合成事件不触发前端 handler
const v = await (await fetch(BASE + '/json/version')).json();
const bws = new WebSocket(v.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
bws.send(JSON.stringify({ id: 9999, method: 'Target.activateTarget', params: { targetId: tab.id } }));
await new Promise((r) => setTimeout(r, 700));
bws.close();
await send('Page.enable').catch(() => {});
await send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const findCenter = async (sel, text) => {
  const expr = `(() => {
    const all = ${JSON.stringify(sel)} ? [...document.querySelectorAll(${JSON.stringify(sel)})] : [...document.querySelectorAll('*')];
    const t = ${JSON.stringify(text)};
    const cs = all.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (e.innerText || '').includes(t); });
    if (!cs.length) return 'NOHIT';
    // 取面积最小的命中元素，否则会匹配到包住整页的祖先容器
    const el = cs.sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return ra.width * ra.height - rb.width * rb.height; })[0];
    const r = el.getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), cls: (el.className || '').toString().slice(0, 50) });
  })()`;
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  return r.result?.value === 'NOHIT' ? null : JSON.parse(r.result?.value);
};

let x = Number(arg('--cx', 0));
let y = Number(arg('--cy', 0));
if (has('--hover-text')) {
  const h = await findCenter(arg('--hover-sel', ''), arg('--hover-text'));
  if (!h) {
    console.log('hover 目标没找到');
    process.exit(1);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: h.x, y: h.y, buttons: 0 });
  console.log('已 hover', JSON.stringify(h));
  await new Promise((r) => setTimeout(r, 900));
  x = 0;
  y = 0;
}
if (!x && !y) {
  if (TXT === '__DUMP__') {
    const dump = await send('Runtime.evaluate', {
      expression: `JSON.stringify([...document.querySelectorAll('*')].filter(e=>{const r=e.getBoundingClientRect();return e.children.length===0&&r.width>0&&/查看|开始|去做|答题|练习|重做/.test(e.innerText||'')&&e.innerText.length<12}).map(e=>{const r=e.getBoundingClientRect();return (e.innerText||'').trim()+'|'+Math.round(r.x)+','+Math.round(r.y)}).slice(0,12))`,
      returnByValue: true,
    });
    console.log('hover 后出现的按钮:', dump.result?.value);
    process.exit(0);
  }
  const box = await findCenter(SEL, TXT);
  if (!box) {
    console.log('没找到目标元素');
    process.exit(1);
  }
  x = box.x;
  y = box.y;
  console.log('目标坐标', JSON.stringify(box));
}

const common = { x, y, button: 'left', clickCount: 1, buttons: 1 };
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...common });
await new Promise((r) => setTimeout(r, 90));
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...common, buttons: 0 });
await new Promise((r) => setTimeout(r, 3500));

const after = await send('Runtime.evaluate', {
  expression: 'JSON.stringify({url:location.href, videos:document.querySelectorAll("video").length, txt:(document.body.innerText||"").replace(/\\s+/g," ").slice(0,300)})',
  returnByValue: true,
});
console.log('after:', after.result?.value);
ws.close();
process.exit(0);
