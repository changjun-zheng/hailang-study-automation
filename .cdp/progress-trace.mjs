// 抓「播放过程中平台自己上报学习进度」的调用：端点、频率、请求体字段。
// 只读页面网络，不改任何状态；不打印任何鉴权头。
//   node .cdp/progress-trace.mjs [--secs 150]
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const SECS = Number(arg('--secs', 150));
const runnerId = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id;

const pages = await (await fetch(BASE + '/json/list')).json();
const t = pages.find((x) => x.id === runnerId && x.type === 'page');
if (!t) {
  console.error('找不到 runner 标签页');
  process.exit(1);
}
const ws = new WebSocket(t.webSocketDebuggerUrl);
const pend = new Map();
let seq = 0;
const reqs = new Map();
const log = [];
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(new Error('ws 失败'));
  ws.onmessage = (m) => {
    const x = JSON.parse(m.data);
    if (x.id && pend.has(x.id)) {
      const p = pend.get(x.id);
      pend.delete(x.id);
      x.error ? p.rej(new Error(x.error.message)) : p.res(x.result);
    } else if (x.method === 'Network.requestWillBeSent') {
      const p = x.params;
      const raw = p.request.url;
      const u = raw.replace('https://study.cqie.edu.cn', '');
      const STATIC = /\.(js|css|png|jpe?g|gif|svg|woff2?|ttf|ico|map)(\?|$)/i;
      // 不再只盯 /gateway/：上报进度很可能走别的域或别的前缀
      if (!STATIC.test(raw) && !raw.startsWith('data:')) {
        reqs.set(p.requestId, { url: u.slice(0, 260), method: p.request.method, body: p.request.postData || '', at: Date.now() });
      }
    } else if (x.method === 'Network.responseReceived') {
      const r = reqs.get(x.params.requestId);
      if (r) r.status = x.params.response.status;
    } else if (x.method === 'Network.webSocketCreated') {
        console.log('  WebSocket:', x.params.url);
    } else if (x.method === 'Network.eventSourceMessageReceived') {
        console.log('  SSE:', x.params.data.slice(0, 200));
    } else if (x.method === 'Network.loadingFinished') {
      const r = reqs.get(x.params.requestId);
      if (r) {
        log.push(r);
        reqs.delete(x.params.requestId);
      }
    }
  };
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pend.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evl = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.value;

await send('Network.enable');
await send('Runtime.enable');
const st0 = await evl(`(()=>{const v=document.querySelector('video');return v?JSON.stringify({d:+(v.duration||0).toFixed(1),t:+v.currentTime.toFixed(1),rate:v.playbackRate,muted:v.muted,paused:v.paused,name:(document.body.innerText.match(/视频：[^\\n]*/)||['?'])[0]}):'NOVIDEO'})()`);
console.log('起始状态:', st0);
if (st0 !== 'NOVIDEO') {
  await evl(`(()=>{const v=document.querySelector('video');v.muted=true;return v.play().then(()=>'ok').catch(e=>'rej:'+e.name)})()`);
}
const t0 = Date.now();
for (let i = 0; i < SECS / 5; i++) {
  await sleep(5000);
  const s = await evl(`(()=>{const v=document.querySelector('video');return v?+v.currentTime.toFixed(1):-1})()`);
  process.stdout.write(`  +${Math.round((Date.now() - t0) / 1000)}s t=${s}  `);
}
console.log('\n\n=== 这段时间出现过的 gateway 端点 ===');
const byUrl = new Map();
for (const r of log) {
  const k = r.method + ' ' + r.url.split('?')[0];
  if (!byUrl.has(k)) byUrl.set(k, { n: 0, sample: r, times: [] });
  const e = byUrl.get(k);
  e.n++;
  e.times.push(Math.round((r.at - t0) / 1000));
}
for (const [k, e] of [...byUrl.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`${String(e.n).padStart(3)}× ${k}   时刻(秒)=${e.times.slice(0, 12).join(',')}`);
  if (/progress|record|study|video|time|learn|report|heart|beat|sync/i.test(k) && e.sample.body) {
    console.log(`      body: ${e.sample.body.slice(0, 400)}`);
  }
}
ws.close();
process.exit(0);
