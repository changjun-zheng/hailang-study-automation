// 把右侧面板每一行的完整文本 + 状态徽标 + 按钮取出来（只读，不点任何东西）
//   node .cdp/rows.mjs <study页URL>
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const U = process.argv[2];
const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || '').slice(0, 160); return r.result?.value; };
await send('Page.enable');
await send('Page.navigate', { url: U });
await new Promise((r) => setTimeout(r, 18000));
const { windowId } = await send('Browser.getWindowForTarget', { targetId: page.id });
await send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
const out = JSON.parse((await evl(`(()=>{
  const rows=[...document.querySelectorAll('.item')].filter(e=>e.getBoundingClientRect().height>8);
  return JSON.stringify(rows.slice(0,40).map(e=>{
    const btn=e.querySelector('.myBtn,[class*=myBtn]');
    const badge=[...e.querySelectorAll('.right *, .item > *')].filter(x=>x.children.length===0).map(x=>(x.textContent||'').replace(/\\s+/g,' ').trim()).filter(s=>s&&s.length<16);
    return {txt:(e.textContent||'').replace(/\\s+/g,' ').trim().slice(0,90),cls:String(e.className),btn:btn?(btn.textContent||'').trim()+'|dis='+btn.getAttribute('disabled'):null,badge:[...new Set(badge)].join(' / ')}
  }))
})()`)) || '[]');
for (const r of out) console.log(`${r.cls.padEnd(12)} ${r.txt}\n${' '.repeat(13)}按钮=${r.btn || '—'}   徽标=${r.badge || '—'}`);
ws.close(); process.exit(0);
