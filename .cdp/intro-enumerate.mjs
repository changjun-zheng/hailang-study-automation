// 只读：抓 progressDetails 的完整真实 URL（不截断），原样重放，再数清整棵目录树里的视频。
//   node .cdp/intro-enumerate.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
const UNIT = '4ca322facea6bd5f080250c14990b91b';
const INTRO_VIDEO = 'e45b2abe24e17165f326b498091b1afa';

const all = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && t.url.includes('study.cqie.edu.cn'));
let KEEP = null; try { KEEP = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id; } catch {}
const full = all.find((t) => t.id === KEEP) || all[0];
const ws = new WebSocket(full.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map(); const urls = [];
ws.onmessage = (e) => {
  const x = JSON.parse(e.data);
  if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); return; }
  if (x.method === 'Network.requestWillBeSent') {
    const u = decodeURIComponent(String(x.params.request.url));
    if (u.includes('/gateway/system/orgStudent/progressDetails')) urls.push(u.replace('https://study.cqie.edu.cn', ''));
  }
};
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', String(r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

await send('Network.enable');
await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=${CID}&studentCourseId=${SC}&version=BK_RJGC_2024&courseUnitId=${UNIT}&videoId=${INTRO_VIDEO}&majorId=${MID}` });
await new Promise((r) => setTimeout(r, 14000));
console.log('页面真实发出的 progressDetails 完整 URL:');
for (const u of [...new Set(urls)]) console.log('   ' + u);

const real = [...new Set(urls)][0];
if (!real) { console.log('没抓到，结束'); ws.close(); process.exit(1); }

const o = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');
  const r=await fetch(${JSON.stringify(real).replace(/"$/g, '"').slice(0, 0) || ''}${''},${''==='x'?'':''})
})()`.replace(/[\s\S]*/, `(async()=>{
  const t=localStorage.getItem('token2');
  const r=await fetch('${real}',{headers:{Authorization:t}}).then(x=>x.json()).catch(e=>({err:String(e)}));
  const top=Array.isArray(r.data)?r.data:[];
  let vids=[];
  const walk=(n)=>{ for(const v of (n.courseCatalogVideoVos||[])) vids.push({videoId:v.id,unitId:v.unitId||n.id,name:v.name,len:v.timeLength,barrier:n.name});
    for(const c of (n.children||[])) walk(c); };
  top.forEach(walk);
  const intro=vids.find(v=>v.videoId==='${INTRO_VIDEO}')||null;
  return JSON.stringify({code:r.code,msg:String(r.msg||'').slice(0,30),topNames:top.map(n=>n.name),total:vids.length,intro,
    barriers:top.map(n=>({name:n.name,vids:(n.courseCatalogVideoVos||[]).length+(n.children||[]).reduce((s,c)=>s+(c.courseCatalogVideoVos||[]).length,0)}))})
})()`)));

console.log(`\n重放结果: code=${o.code} msg=${o.msg}`);
console.log('顶层节点:', (o.topNames || []).join(' | '));
console.log('各顶层节点数到的视频:', JSON.stringify(o.barriers));
console.log(`整棵树视频总数 = ${o.total}`);
console.log('「课程介绍」条目:', JSON.stringify(o.intro));
ws.close(); process.exit(0);
