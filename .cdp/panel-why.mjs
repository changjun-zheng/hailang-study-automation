// 面板在某页面上没出现 —— 把源码注进那个页面，把抛出的异常原样打出来。
//   node .cdp/panel-why.mjs [URL]
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9225';
import fs from 'node:fs';
import path from 'node:path';
const SRC = fs.readFileSync(path.resolve(import.meta.dirname, '..', 'hailang-panel.user.js'), 'utf8');

const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('study.cqie'));
if (!tabs.length) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send('Page.enable');
if (process.argv[2]) { await send('Page.navigate', { url: process.argv[2] }); await sleep(12000); }

const before = await send('Runtime.evaluate', { expression: 'JSON.stringify({url:location.href.slice(0,80),hasPanel:!!document.getElementById("kg-panel"),flag:!!window.__kgPanel,body:!!document.body})', returnByValue: true });
console.log('注入前:', before.result.value);
const r = await send('Runtime.evaluate', { expression: `(()=>{try{${SRC};return 'OK'}catch(e){return 'THROW '+e.name+': '+e.message+' @ '+(e.stack||'').split('\\n').slice(0,3).join(' | ')}})()`, returnByValue: true });
console.log('注入结果:', JSON.stringify(r.result.value ?? r.exceptionDetails).slice(0, 400));
await sleep(1200);
const after = await send('Runtime.evaluate', { expression: 'JSON.stringify({panels:document.querySelectorAll("#kg-panel").length,flag:!!window.__kgPanel,v:window.__kgPanel&&window.__kgPanel.version})', returnByValue: true });
console.log('注入后:', after.result.value);
ws.close(); process.exit(0);
