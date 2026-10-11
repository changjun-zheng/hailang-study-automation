// 把某一行的 DOM 拆开：每个子节点的 own text / class / 颜色 / 图标类名，判断「已完成」「未完成」到底挂在哪个元素上
//   node .cdp/row-anatomy.mjs <study页URL> <要看的行关键字>
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const U = process.argv[2];
const KEY = process.argv[3] || '存储和显示Vue的数据-1';
if (!U) { console.error('缺 URL'); process.exit(1); }

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || '').slice(0, 200); return r.result?.value; };
await send('Page.enable'); await send('Runtime.enable');
const { windowId } = await send('Browser.getWindowForTarget', { targetId: page.id });
await send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
await send('Page.navigate', { url: U });
await new Promise((r) => setTimeout(r, 18000));

const out = await evl(`(()=>{
  const rows=[...document.querySelectorAll('.item')].filter(e=>(e.textContent||'').indexOf(${JSON.stringify(KEY)})>-1);
  if(!rows.length) return '没找到含「' + ${JSON.stringify(KEY)} + '」的行；当前渲染出的 .item 共 ' + document.querySelectorAll('.item').length + ' 行：' + [...document.querySelectorAll('.item')].map(e=>(e.textContent||'').replace(/\\s+/g,' ').trim().slice(0,26)).join(' ⎢ ');
  const walk=(e,d)=>{const cs=getComputedStyle(e);const own=[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent.replace(/\\s+/g,' ').trim()).filter(Boolean).join('');
    const r=e.getBoundingClientRect();
    const line='  '.repeat(d)+e.tagName+(e.className?'.'+String(e.className).trim().replace(/\\s+/g,'.'):'')+(own?'  「'+own.slice(0,40)+'」':'')+'  color='+cs.color+' vis='+(cs.display==='none'||r.height===0?'隐藏':'可见');
    return [line].concat([...e.children].flatMap(c=>walk(c,d+1)))};
  return rows.map(e=>walk(e,0).join(String.fromCharCode(10))).join(String.fromCharCode(10)+'---'+String.fromCharCode(10))
})()`);
console.log(String(out).slice(0, 4000));
ws.close(); process.exit(0);
