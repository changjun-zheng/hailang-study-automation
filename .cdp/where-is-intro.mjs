// 只读：抓学习页加载时发出的 gateway 调用，找出"课程介绍"这个关卡是从哪个接口来的。
//   node .cdp/where-is-intro.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
const UNIT = '4ca322facea6bd5f080250c14990b91b';
const VIDEO = 'e45b2abe24e17165f326b498091b1afa';

const all = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && t.url.includes('study.cqie.edu.cn'));
let KEEP = null; try { KEEP = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id; } catch {}
const full = all.find((t) => t.id === KEEP) || all[0];
const ws = new WebSocket(full.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map(); const rows = new Map();
ws.onmessage = (e) => {
  const x = JSON.parse(e.data);
  if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); return; }
  if (x.method === 'Network.responseReceived' && String(x.params.response.url).includes('/gateway/')) {
    rows.set(x.params.requestId, { u: decodeURIComponent(String(x.params.response.url).replace('https://study.cqie.edu.cn', '')), s: x.params.response.status });
  }
};
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.value; };

await send('Network.enable');
await send('Page.enable');
await send('Runtime.enable');
// 重新加载这个单元页，把这一路的 gateway 调用抓下来
await send('Page.navigate', { url: `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=${CID}&studentCourseId=${SC}&version=BK_RJGC_2024&courseUnitId=${UNIT}&videoId=${VIDEO}&majorId=${MID}` });
await new Promise((r) => setTimeout(r, 14000));

console.log(`抓到 ${rows.size} 个 gateway 响应：`);
const hits = [];
for (const r of [...rows.values()]) {
  const isCat = /atalog|arrier|ideo|learn|progress|detail/i.test(r.u);
  if (!isCat) continue;
  let flag = '';
  try {
    const body = String(await evl(`fetch(${JSON.stringify(r.u)},{headers:{Authorization:localStorage.getItem('token2')}}).then(x=>x.text())`));
    const hasIntro = body.includes('课程介绍');
    const nVideo = (body.match(/"videoId"/g) || []).length;
    flag = hasIntro ? `★含「课程介绍」 "videoId"出现${nVideo}次` : `   不含「课程介绍」 "videoId"出现${nVideo}次`;
    if (hasIntro) hits.push(r.u);
  } catch { flag = '   (不可重放)'; }
  console.log(`  ${r.s} ${r.u.slice(0, 96)}\n  ${flag}`);
}
console.log('\n★「课程介绍」来自这些接口:');
for (const h of hits) console.log('   ' + h.slice(0, 120));
ws.close(); process.exit(0);
