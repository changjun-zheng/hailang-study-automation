// 找「站点自己换视频」的入口：展开一行，把里面所有 pointer 节点逐个点，用 getVideoCloudUrl 当"换源了"的判据
//   node .cdp/expand-probe.mjs <study页URL> <要展开的行关键字>
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const U = process.argv[2];
const KEY = process.argv[3] || '使用计算属性-1';
const OUT = path.join(ROOT, '.cdp', 'expand-probe.txt');
if (!U) { console.error('缺 URL'); process.exit(1); }

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map(); let cloud = [];
ws.onmessage = (e) => {
  const x = JSON.parse(e.data);
  if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); return; }
  if (x.method === 'Network.requestWillBeSent') {
    const u = decodeURIComponent(x.params.request.url);
    if (/getVideoCloudUrl\?path=[^"]*\/(\w+)\.mp4/.test(u)) cloud.push(u.match(/(\w+)\.mp4/)[1]);
  }
};
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || '').slice(0, 200); return r.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const guard = async () => { const { windowId } = await send('Browser.getWindowForTarget', { targetId: page.id }); const b = await send('Browser.getWindowBounds', { windowId }); if (b.bounds.windowState !== 'normal') await send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } }); };
const curVid = async () => (await evl(`(location.href.match(/videoId=(\\w+)/)||[])[1]||''`)) || '';
const clickXY = async (x, y) => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mousePressed' ? 'left' : 'none', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 }); };

await send('Page.enable'); await send('Network.enable'); await send('Runtime.enable');
await guard();
await send('Page.navigate', { url: U });
await sleep(20000);
await guard();
const start = await curVid();
console.log('起点 videoId =', start.slice(0, 12));

// 展开这一行（点它的折叠箭头）
const ar = JSON.parse((await evl(`(()=>{const want=${JSON.stringify(KEY)};const row=[...document.querySelectorAll('.item')].filter(e=>(e.textContent||'').includes(want)&&e.getClientRects().length>0&&e.offsetParent!==null)[0];if(!row)return '{}';const a=row.querySelector('[class*=icon-jiantou]')||row.querySelector('.name');const r=a.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),cls:String(a.className).slice(0,40),h:Math.round(r.height)})})()`)) || '{}');
console.log('折叠箭头:', JSON.stringify(ar));
if (ar.x !== undefined) { await clickXY(ar.x, ar.y); await sleep(6000); }
console.log('展开之后是否换源:', (await curVid()).slice(0, 12), ' cloud 请求:', cloud.join(',') || '无');

// 把这一行展开出来的子条目和按钮全列出来
const list = JSON.parse((await evl(`(()=>{
  const want=${JSON.stringify(KEY)};
  const row=[...document.querySelectorAll('.item')].filter(e=>(e.textContent||'').includes(want)&&e.getClientRects().length>0&&e.offsetParent!==null)[0];
  if(!row)return '[]';
  const host=row.closest('li')||row.parentElement;
  const cands=[...host.querySelectorAll('*')].filter(e=>{const cs=getComputedStyle(e);const r=e.getBoundingClientRect();return cs.cursor==='pointer'&&r.width>10&&r.height>10&&r.top>=0&&r.bottom<=innerHeight});
  return JSON.stringify(cands.map(e=>{const r=e.getBoundingClientRect();return {tag:e.tagName,cls:String(e.className).slice(0,36),txt:(e.textContent||'').replace(/\\s+/g,' ').trim().slice(0,30),x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}}))
})()`)) || '[]');
console.log(`\n这一组里可点且在视口内的节点 ${list.length} 个：`);
for (const c of list) console.log(`  ${c.tag}.${c.cls} "${c.txt}" @${c.x},${c.y}`);

fs.writeFileSync(OUT, '');
for (const c of list) {
  cloud = [];
  const before = await curVid();
  await clickXY(c.x, c.y);
  await sleep(7000);
  const after = await curVid();
  const switched = after !== before || cloud.length > 0;
  const line = `点 ${c.tag}.${c.cls} "${c.txt}" → videoId ${before.slice(0, 8)}→${after.slice(0, 8)} 换源请求=${cloud.length} 条 ${switched ? '★ 切成功了' : '✗ 没反应'}`;
  console.log('  ' + line);
  fs.appendFileSync(OUT, line + String.fromCharCode(10));
  if (switched) { console.log('  ★★ 找到入口了：' + c.tag + '.' + c.cls + ' 「' + c.txt + '」'); break; }
}
ws.close(); process.exit(0);
