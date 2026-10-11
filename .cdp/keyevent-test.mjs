// 测「合成 KeyboardEvent（非可信输入）能不能替 CDP 键盘事件驱动站点播放器组件」
// 若可行，油猴脚本就能自己起播并让心跳跑起来，不再依赖 runner 的 CDP 输入。
//   node .cdp/keyevent-test.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const OUT = path.join(ROOT, '.cdp', 'keyevent.txt');
const U = process.argv[2];
if (!U || !U.startsWith('http')) { console.error('用法: node .cdp/keyevent-test.mjs <study页URL>'); process.exit(1); }

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.url && t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map(); const meta = new Map(); let beats = [];
ws.onmessage = (e) => {
  const x = JSON.parse(e.data);
  if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); return; }
  if (x.method === 'Network.requestWillBeSent') {
    const q = x.params.request; const u = decodeURIComponent(q.url);
    if (u.includes('/gateway/') && !u.includes('/gateway/static/')) meta.set(x.params.requestId, { m: q.method, u: u.replace('https://study.cqie.edu.cn', '').slice(0, 96), t: new Date().toTimeString().slice(0, 8) });
  } else if (x.method === 'Network.loadingFinished') {
    const r = meta.get(x.params.requestId); if (!r) return; meta.delete(x.params.requestId);
    if (/StudyVideoPlan|Monitor/i.test(r.u)) beats.push(r);
  }
};
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || '').slice(0, 180); return r.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const st = async () => JSON.parse((await evl(`(()=>{const v=document.querySelector('video');return JSON.stringify(v?{t:+v.currentTime.toFixed(1),p:v.paused}:{noVideo:true})})()`)) || '{}');
const { windowId } = await send('Browser.getWindowForTarget', { targetId: page.id });
const keep = async () => { const b = await send('Browser.getWindowBounds', { windowId }); if (b.bounds.windowState !== 'normal') await send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } }); };

await send('Page.enable'); await send('Network.enable'); await send('Runtime.enable');
await keep();
await send('Page.navigate', { url: U });
await sleep(20000); await keep();
console.log('初始:', JSON.stringify(await st()), ' 上报', beats.length, '条');

// 三种"非可信"事件派发方式，逐个试；每试一种等 40 秒看有没有心跳
const WAYS = [
  ['document 上派发 KeyboardEvent keydown 空格', `(()=>{const o={key:' ',code:'Space',keyCode:32,which:32,bubbles:true,cancelable:true};document.dispatchEvent(new KeyboardEvent('keydown',o));document.dispatchEvent(new KeyboardEvent('keyup',o));return 'dispatched'})()`],
  ['video 元素上派发 KeyboardEvent', `(()=>{const v=document.querySelector('video');const o={key:' ',code:'Space',keyCode:32,which:32,bubbles:true,cancelable:true};v.dispatchEvent(new KeyboardEvent('keydown',o));document.dispatchEvent(new KeyboardEvent('keydown',o));return 'dispatched'})()`],
  ['window 上 keydown + 焦点给 body', `(()=>{window.focus();document.body.focus();const o={key:' ',code:'Space',keyCode:32,which:32,bubbles:true};window.dispatchEvent(new KeyboardEvent('keydown',o));return 'dispatched'})()`],
];
const log = [];
for (const [name, expr] of WAYS) {
  beats = [];
  const before = await st();
  console.log(`\n>>> ${name}  (t=${before.t} paused=${before.p})`);
  console.log('    派发结果:', await evl(expr));
  for (let i = 0; i < 4; i++) { await sleep(12000); await keep(); const s = await st(); console.log(`    +${(i + 1) * 12}s t=${s.t} paused=${s.p} 心跳 ${beats.length} 条`); }
  const after = await st();
  const line = `${name} -> 播放 ${before.p ? '否' : '是'}→${after.p ? '否' : '是'} (t ${before.t}→${after.t})  心跳 ${beats.length} 条 ${beats.map((b) => b.u.split('/').pop()).join(',')}`;
  log.push(line);
  console.log('  ★ ' + line);
  if (!after.p && beats.length) { console.log('\n★ 非可信 KeyboardEvent 就够 —— 油猴脚本可以自己起播并驱动心跳'); break; }
  if (!after.p) { log.push('  （播起来了但没心跳：组件状态机需要真手势）'); console.log('  播起来了但无心跳 —— 组件状态机仍需可信输入'); }
}
fs.writeFileSync(OUT, log.join(String.fromCharCode(10)) + String.fromCharCode(10));
console.log('\n结论已存 .cdp/keyevent.txt');
ws.close(); process.exit(0);
