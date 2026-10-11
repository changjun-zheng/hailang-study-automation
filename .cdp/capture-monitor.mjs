// 抓「视频监控 / 进度」相关调用的完整 URL 与时机：导航 → 起播 → 播 60 秒 → 再导航走。
// 只读，不改任何状态；不打印请求头（里面有 token）。
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const fs = await import('node:fs');
const path = await import('node:path');
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEEP = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id;
const VIDEO = {
  unitId: '6814946beba252b0ae35bf229d454ae7',
  videoId: '6a00eafa7e7ef6fbc28a52f2cba98108',
  name: '使用生命周期函数-2',
};

const full = (await (await fetch(BASE + '/json/list')).json()).find((t) => t.id === KEEP && t.type === 'page');
if (!full) {
  console.error('找不到标签页');
  process.exit(1);
}
const ws = new WebSocket(full.webSocketDebuggerUrl);
const pend = new Map();
let seq = 0;
await new Promise((r) => (ws.onopen = r));
const hits = [];
let mark = Date.now();
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && pend.has(x.id)) {
    const p = pend.get(x.id);
    pend.delete(x.id);
    x.error ? p.rej(new Error(x.error.message)) : p.res(x.result);
    return;
  }
  if (x.method === 'Network.requestWillBeSent') {
    const u = x.params.request.url;
    if (/Monitor|studyVideo|videoProgress|watchRecord|studyRecord/i.test(u)) {
      hits.push(`${String(Math.round((Date.now() - mark) / 1000)).padStart(4)}s ${x.params.request.method} ${decodeURIComponent(u).replace('https://study.cqie.edu.cn', '').slice(0, 200)}`);
    }
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
const url = `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=e8716aab5bc18a56b115d3303f43555c&studentCourseId=2c235454cef7b898bd11e77ad2b0d20c&version=BK_RJGC_2024&courseUnitId=${VIDEO.unitId}&videoId=${VIDEO.videoId}&majorId=9f07cf1e06d0a57957bd6be34efd3930`;
mark = Date.now();
console.log('① 导航进来');
await send('Page.navigate', { url });
await sleep(16000);
console.log(`   此刻 ${hits.length} 条：\n   ` + hits.join('\n   '));
console.log('② 起播，播 60 秒');
console.log('   ' + (await evl(`(()=>{const v=document.querySelector('video');if(v){v.muted=true;v.playbackRate=1;return v.play().then(()=>'+ok+').catch(e=>'+rej:'+e.name)}return 'NOVIDEO'})()`)));
const before = hits.length;
await sleep(60000);
console.log(`   这 60 秒里新增 ${hits.length - before} 条监控/进度调用${hits.length === before ? '（一条都没有）' : '：\n   ' + hits.slice(before).join('\n   ')}`);
console.log('③ 导航去别的视频（模拟离开）');
const b2 = hits.length;
mark = Date.now();
await send('Page.navigate', { url: url.replace(VIDEO.videoId, '3159e08af4683e6e8736a9015ebcae9e') });
await sleep(12000);
console.log(`   离开时新增 ${hits.length - b2} 条：\n   ` + (hits.slice(b2).join('\n   ') || '（没有）'));
ws.close();
process.exit(0);
