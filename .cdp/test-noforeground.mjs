// 关键验证：Chrome 带上新参数后，「不顶前台」能不能加载出媒体。
// 全程不调用 Target.activateTarget，只导航 + 读时长，并把真实可见性一起打出来。
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const runnerId = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id;

const find = () => (0, fetch)(BASE + '/json/list').then((r) => r.json());
let t = null;
for (let i = 0; i < 15 && !t; i++) {
  t = (await find()).find((x) => x.id === runnerId && x.type === 'page');
  if (!t) await sleep(500);
}
if (!t) {
  console.error('找不到 runner 标签页');
  process.exit(1);
}
const ws = new WebSocket(t.webSocketDebuggerUrl);
const inflight = new Map();
let seq = 0;
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(new Error('ws 失败'));
  ws.onmessage = (m) => {
    const x = JSON.parse(m.data);
    if (x.id && inflight.has(x.id)) {
      const p = inflight.get(x.id);
      inflight.delete(x.id);
      x.error ? p.rej(new Error(x.error.message)) : p.res(x.result);
    }
  };
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    inflight.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evl = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.value;

await send('Page.enable');
await send('Runtime.enable');

const probe = `(()=>{const v=document.querySelector('video');let rv='?';try{rv=Object.getOwnPropertyDescriptor(Document.prototype,'visibilityState').get.call(document)}catch(e){}
return JSON.stringify({rv,rs:v?v.readyState:-1,d:v?+(v.duration||0).toFixed(1):-1,t:v?+v.currentTime.toFixed(1):-1,paused:v?v.paused:true,n:(document.body?document.body.innerText:'').includes('视频：')})})()`;

// 用 runner 自己的锁页做导航（它现在就是空闲的），目标换成一门课的某条视频
const url =
  'https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=e8716aab5bc18a56b115d3303f43555c&studentCourseId=2c235454cef7b898bd11e77ad2b0d20c&version=BK_RJGC_2024&courseUnitId=6814946beba252b0ae35bf229d454ae7&majorId=9f07cf1e06d0a57957bd6be34efd3930';
console.log('导航（不顶前台）…');
await send('Page.navigate', { url });
const rows = [];
for (let i = 0; i < 40; i++) {
  await sleep(1000);
  const s = await evl(probe);
  rows.push(`${i + 1}s ${s}`);
  const o = JSON.parse(s);
  if (o.d > 0) {
    console.log(`第 ${i + 1} 秒就出时长了：${s}`);
    break;
  }
}
console.log(rows.slice(-6).join('\n'));
const last = JSON.parse(rows[rows.length - 1].replace(/^\d+s /, ''));
console.log(`\n判定：不顶前台时 ${last.d > 0 ? '能' : '不能'}加载媒体；真实可见性=${last.rv}`);
ws.close();
process.exit(0);
