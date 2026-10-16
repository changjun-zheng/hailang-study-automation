// 让站点自己点开「知识练习」，把这一路它发出的 gateway 请求（含 body）原样抓下来。
// 目的：拿到 studyKnowledgeExerciseRecord 的真实必填字段名 —— 猜参数已被 501 全灭。
// 用新建标签页做，不动 runner 正在用的页面。
//   node .cdp/trace-knowledge.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
const UNIT = process.argv[2] || '43004df89e9325e5d3cbd659af64c720'; // 构建Vue的应用实例

const ver = await (await fetch(BASE + '/json/version')).json();
const bws = new WebSocket(ver.webSocketDebuggerUrl);
const bp = new Map(); let bid = 0;
await new Promise((r) => (bws.onopen = r));
bws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && bp.has(x.id)) { const p = bp.get(x.id); bp.delete(x.id); p(x.result); } };
const bask = (method, params) => new Promise((res) => { const id = ++bid; bp.set(id, res); bws.send(JSON.stringify({ id, method, params })); });

const { targetId } = await bask('Target.createTarget', { url: 'about:blank' });
let wsUrl = null;
for (let i = 0; i < 25 && !wsUrl; i++) {
  await new Promise((r) => setTimeout(r, 400));
  wsUrl = (await (await fetch(BASE + '/json/list')).json()).find((t) => t.id === targetId)?.webSocketDebuggerUrl;
}
const ws = new WebSocket(wsUrl);
const pend = new Map(); let seq = 0; const rows = []; const byId = new Map();
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); return; }
  if (x.method === 'Network.requestWillBeSent') {
    const q = x.params.request;
    // 不能按 URL 里有没有 /gateway/ 过滤：讲义是嵌入式预览应用（/static/yz/view/preview/...），
    // 它的 XHR 完全可能走别的路径，按 URL 关键字过滤会把要找的那个请求直接滤掉。
    const typ = x.params.type || q.type || '';
    if (/^(XHR|Fetch)$/i.test(typ)) byId.set(x.params.requestId, { m: q.method, u: decodeURIComponent(q.url).replace('https://study.cqie.edu.cn', ''), body: q.postData || '' });
  } else if (x.method === 'Network.responseReceived') {
    const r = byId.get(x.params.requestId); if (r) r.status = x.params.response.status;
  } else if (x.method === 'Network.loadingFinished') {
    const r = byId.get(x.params.requestId); if (r) rows.push(r);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.value; };

await send('Page.enable'); await send('Network.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=${CID}&studentCourseId=${SC}&version=BK_RJGC_2024&courseUnitId=${UNIT}&majorId=${MID}` });
await new Promise((r) => setTimeout(r, 16000));
// 注意：这里不能清空 rows。上一版清完再点，结果抓到 0 条 —— 说明这一层的题目是随初始加载
// 一次性下发的，清空正好把唯一那批证据删掉了。

// 点知识点行本身（如 data / v-html），「知识练习(1题)」只是徽章，点它不发请求
const NAME = process.argv[3] || 'data';
const hit = JSON.parse(await evl(`(()=>{const els=[...document.querySelectorAll('*')].filter(e=>{const t=(e.textContent||'').replace(/\\s+/g,'');return t.startsWith(${JSON.stringify(NAME)})&&t.length<24&&e.getBoundingClientRect().height>0&&e.children.length<=3});
  if(!els.length)return '{"ok":false}';const e=els[els.length-1];e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();
  return JSON.stringify({ok:true,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),txt:(e.textContent||'').trim().slice(0,26)})})()`));
console.log(`知识点「${NAME}」入口:`, JSON.stringify(hit));
if (hit.ok) {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: hit.x, y: hit.y, button: type === 'mousePressed' ? 'left' : 'none', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  }
  await new Promise((r) => setTimeout(r, 12000));
}
// 面板里可能还要点「开始练习」
const hit2 = JSON.parse(await evl(`(()=>{const els=[...document.querySelectorAll('button,div,span,a')].filter(e=>{const t=(e.textContent||'').replace(/\\s+/g,'');return (t==='开始练习'||t==='去练习'||t==='开始作答')&&e.getBoundingClientRect().height>0});
  if(!els.length)return '{"ok":false}';const e=els[els.length-1];const r=e.getBoundingClientRect();return JSON.stringify({ok:true,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)})})()`));
if (hit2.ok) {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: hit2.x, y: hit2.y, button: type === 'mousePressed' ? 'left' : 'none', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  }
  await new Promise((r) => setTimeout(r, 12000));
}
console.log('点完后的 URL:', String(await evl('location.href')).slice(0, 120));
console.log(`\n抓到 ${rows.length} 个 gateway 调用（不过滤，全部列出）：`);
for (const r of rows.slice(0, 40)) {
  console.log(`  ${r.m} ${r.u.slice(0, 100)}`);
  console.log(`     body=${r.body ? r.body.slice(0, 300) : '(无 body)'}`);
}
// 面板有没有真打开：看页面上是否出现题目文字/选项
console.log('\n点开后面板内容线索：');
console.log('  ' + String(await evl(`(()=>{const m=(document.body.innerText||'').match(/[^\\n]*(知识练习|答题|选项|正确|提交|下一题)[^\\n]*/g)||[];return JSON.stringify([...new Set(m)].slice(0,8))})()`)).slice(0, 500));
await bask('Target.closeTarget', { targetId });
ws.close(); bws.close(); process.exit(0);
