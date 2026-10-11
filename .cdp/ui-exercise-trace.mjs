// 让站点自己的 UI 去点「习题」，把这一路上它发出的 gateway 请求 + 响应原样抓下来。
// 目的：判定 exercisesList 的 501 到底是"我们少调了一步"还是"平台自己也不行"。
// 用新建标签页做，不碰 runner 正在播放的那一页。
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
const UNIT = '26faae1858fb8cfa8887ee390de5dacf';

const ver = await (await fetch(BASE + '/json/version')).json();
const bws = new WebSocket(ver.webSocketDebuggerUrl);
const bp = new Map();
let bid = 0;
await new Promise((r) => (bws.onopen = r));
bws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && bp.has(x.id)) {
    const p = bp.get(x.id);
    bp.delete(x.id);
    p(x.result);
  }
};
const bask = (method, params) => new Promise((res) => { const id = ++bid; bp.set(id, res); bws.send(JSON.stringify({ id, method, params })); });

const { targetId } = await bask('Target.createTarget', { url: 'about:blank' });
let wsUrl = null;
for (let i = 0; i < 25 && !wsUrl; i++) {
  await new Promise((r) => setTimeout(r, 400));
  wsUrl = (await (await fetch(BASE + '/json/list')).json()).find((t) => t.id === targetId)?.webSocketDebuggerUrl;
}
const ws = new WebSocket(wsUrl);
const pend = new Map();
let seq = 0;
await new Promise((r) => (ws.onopen = r));
const rows = [];
const byId = new Map();
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && pend.has(x.id)) {
    const p = pend.get(x.id);
    pend.delete(x.id);
    x.error ? p.rej(new Error(x.error.message)) : p.res(x.result);
    return;
  }
  if (x.method === 'Network.requestWillBeSent') {
    const q = x.params.request;
    if (q.url.includes('/gateway/')) byId.set(x.params.requestId, { m: q.method, u: decodeURIComponent(q.url).replace('https://study.cqie.edu.cn', ''), body: q.postData || '' });
  } else if (x.method === 'Network.responseReceived') {
    const r = byId.get(x.params.requestId);
    if (r) r.status = x.params.response.status;
  } else if (x.method === 'Network.loadingFinished') {
    const r = byId.get(x.params.requestId);
    if (r) rows.push(r);
  }
};
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pend.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evl = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.value;

await send('Page.enable');
await send('Network.enable');
await send('Runtime.enable');
const STUDY_URL = `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=${CID}&studentCourseId=${SC}&version=BK_RJGC_2024&courseUnitId=${UNIT}&majorId=${MID}`;
await send('Page.navigate', { url: STUDY_URL });
await new Promise((r) => setTimeout(r, 16000));
rows.length = 0;

// 点「习题」条目（真人就是这么进的）
const box = JSON.parse(
  await evl(`(()=>{const els=[...document.querySelectorAll('div.name,.item,span,div')].filter(e=>{const t=(e.textContent||'').replace(/\\s+/g,'');return t.startsWith('习题：')&&t.length<20&&e.getBoundingClientRect().height>0});
    if(!els.length)return '{"ok":false}';const e=els[0];e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();
    return JSON.stringify({ok:true,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),txt:(e.textContent||'').trim().slice(0,30)})})()`)
);
console.log('习题条目定位:', JSON.stringify(box));
if (box.ok) {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: type === 'mousePressed' ? 'left' : 'none', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  }
  await new Promise((r) => setTimeout(r, 14000));
}
console.log('点完之后 URL =', (await evl('location.href')).slice(0, 140));
rows.length = 0;
// 面板里那个「开始练习」才是真正的入口按钮
const b2 = JSON.parse(
  await evl(`(()=>{const els=[...document.querySelectorAll('button,div,span,a')].filter(e=>{const t=(e.textContent||'').replace(/\s+/g,'');return t==='开始练习'&&e.getBoundingClientRect().height>0});
    if(!els.length)return '{"ok":false}';const e=els[els.length-1];e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();
    return JSON.stringify({ok:true,x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)})})()`)
);
console.log('「开始练习」按钮定位:', JSON.stringify(b2));
console.log('候选元素与遮挡检查:');
const cand = await evl(`(()=>{const els=[...document.querySelectorAll('*')].filter(e=>(e.textContent||'').trim()==='开始练习');return els.map(e=>{const r=e.getBoundingClientRect();const cx=Math.round(r.x+r.width/2),cy=Math.round(r.y+r.height/2);const top=document.elementFromPoint(cx,cy);return e.tagName+'|'+Math.round(r.width)+'x'+Math.round(r.height)+'|@'+cx+','+cy+'|top='+(top?top.tagName+'.'+String(top.className).slice(0,22):'null')+'|contains='+(top?e.contains(top):false)}).join(' ;; ')})()`);
console.log('  ' + String(cand || '空').split(' ;; ').join(String.fromCharCode(10,32,32)));if (b2.ok) {
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x: b2.x, y: b2.y, button: type === 'mousePressed' ? 'left' : 'none', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
  }
  await new Promise((r) => setTimeout(r, 14000));
}
console.log('点开始练习后 URL =', (await evl('location.href')).slice(0, 140));
console.log('页面文案: ' + String(await evl(`(document.body.innerText.match(/[^
]*(变化|练习|作答|提交|题|错误)[^
]*/g)||[]).slice(0,8).join(' | ')`)).slice(0, 400));
console.log('页面提示（取含"练习/变化/失败/错误"的行）:');
console.log('  ' + String(await evl(`(document.body.innerText.match(/[^\\n]*(变化|练习|失败|错误|无法|不存在)[^\\n]*/g)||[]).slice(0,6).join(' \\n  ')`)));
console.log('\n这一路上站点自己发出的 gateway 调用（含响应里的 code/msg）：');
for (const r of rows) {
  let tail = '';
  try {
    const j = JSON.parse(await evl(`fetch(${JSON.stringify(r.u)}, {method:${JSON.stringify(r.m)},headers:{'Content-Type':'application/json',Authorization:localStorage.getItem('token2')}${r.body ? ',body:' + JSON.stringify(r.body) : ''}}).then(x=>x.text())`));
    const d = j.data;
    tail = `→ code=${j.code} msg=${String(j.msg).slice(0, 44)} data=${d === null ? 'null' : typeof d === 'boolean' ? d : Array.isArray(d) ? d.length + '条' : typeof d === 'object' ? Object.keys(d).slice(0, 6).join(',') : JSON.stringify(d).slice(0, 30)}`;
  } catch (e) {
    tail = '→ 响应不可重放';
  }
  console.log(`  ${r.m} ${r.u.slice(0, 92)}\n      ${r.body ? 'body=' + r.body.slice(0, 140) : '(无 body)'}  ${tail}`);
}
await bask('Target.closeTarget', { targetId });
ws.close();
bws.close();
process.exit(0);
