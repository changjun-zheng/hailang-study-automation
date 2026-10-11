// 枚举目标那一行里所有 cursor:pointer 的节点，逐个真实点击，看哪一个会让播放器换源
//   node .cdp/probe-row.mjs <目录条目名>
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const TARGET = process.argv[2] || '使用两种方式实现路由参数传递-1';
const OUT = path.join(ROOT, '.cdp', 'plan-chain.txt');

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map(); const seen = [];
ws.onmessage = (e) => {
  const x = JSON.parse(e.data);
  if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); return; }
  if (x.method === 'Network.requestWillBeSent') {
    const u = decodeURIComponent(x.params.request.url);
    if (u.includes('/gateway/') && !u.includes('/gateway/static/')) seen.push(`${x.params.request.method} ${u.replace('https://study.cqie.edu.cn', '').slice(0, 120)}${x.params.request.postData ? '  BODY=' + x.params.request.postData.slice(0, 400) : ''}`);
  }
};
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || '').slice(0, 160); return r.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const st = async () => JSON.parse((await evl(`(()=>{const v=document.querySelector('video');return JSON.stringify({t:v?+v.currentTime.toFixed(1):null,d:v?Math.round(v.duration):null,src:(v&&(v.currentSrc||v.src)||'').slice(-22)})})()`)) || '{}');

await send('Page.enable'); await send('Network.enable'); await send('Runtime.enable');
console.log('起点:', JSON.stringify(await st()));

// 列出这一行的结构 + 所有 pointer 节点
const list = JSON.parse((await evl(`(()=>{
  const want=('视频：' + ${JSON.stringify(TARGET)}).replace(/\\s+/g,'');
  const name=[...document.querySelectorAll('div.name')].find(x=>(x.textContent||'').replace(/\\s+/g,'').startsWith(want));
  if(!name)return JSON.stringify({ok:false});
  const row=name.closest('.item')||name.parentElement;
  const cands=[...row.querySelectorAll('*')].filter(e=>{const cs=getComputedStyle(e);return cs.cursor==='pointer'&&e.getBoundingClientRect().width>6&&e.getBoundingClientRect().height>6});
  return JSON.stringify({ok:true,rowCls:String(row.className),rowHTML:row.outerHTML.replace(/\\s+/g,' ').slice(0,700),cands:cands.map(e=>{const r=e.getBoundingClientRect();return {tag:e.tagName,cls:String(e.className).slice(0,44),txt:(e.textContent||'').trim().slice(0,26),x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),w:Math.round(r.width),h:Math.round(r.height)}})})
})()`)) || '{}');
if (!list.ok) { console.log('没找到这一行'); process.exit(1); }
console.log('行 class:', list.rowCls);
console.log('行 HTML（截断）:\n' + list.rowHTML);
console.log('\ncursor:pointer 的候选节点 ' + list.cands.length + ' 个：');
for (const c of list.cands) console.log(`  ${c.tag}.${c.cls} "${c.txt}" ${c.w}x${c.h} @${c.x},${c.y}`);

// 逐个点，点完看播放器换没换源
for (let i = 0; i < list.cands.length; i++) {
  const c = list.cands[i];
  if (c.y < 0 || c.y > 851) { console.log(`\n[${i}] 跳过（不在视口）`); continue; }
  const before = await st();
  seen.length = 0;
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: c.x, y: c.y, button: type === 'mousePressed' ? 'left' : 'none', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  await sleep(6000);
  const after = await st();
  const changed = after.src !== before.src || after.d !== before.d;
  console.log(`\n[${i}] 点 ${c.tag}.${c.cls} "${c.txt}" → d ${before.d}→${after.d} src变=${changed ? '★是' : '否'}  请求 ${seen.length} 条`);
  for (const s of seen.slice(0, 6)) console.log('     ' + s.slice(0, 200));
  fs.appendFileSync(OUT, `\n# [${i}] ${c.tag}.${c.cls} "${c.txt}" changed=${changed}\n` + seen.join(String.fromCharCode(10)) + String.fromCharCode(10));
  if (changed) { console.log('★ 就是这个节点'); break; }
}
ws.close(); process.exit(0);
