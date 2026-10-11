// 只读观察 runner 自己标签页的有效倍速（不导航、不点击、不改任何状态）。
// 为什么测这个而不是另开窗口：Chrome 的媒体加载/解码降速看的是 OS 层窗口遮挡，
// 另开的窗口被你的其它应用压住 → readyState 恒 0、根本不出时长。runner 的标签页才是真实运行形态。
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const runnerId = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id;

const ws = new WebSocket((await (await fetch(BASE + '/json/list')).json()).find((t) => t.id === runnerId)?.webSocketDebuggerUrl);
const inflight = new Map();
let seq = 0;
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(new Error('连不上 runner 标签页'));
  ws.onmessage = (m) => {
    const x = JSON.parse(m.data);
    if (x.id && inflight.has(x.id)) {
      const p = inflight.get(x.id);
      inflight.delete(x.id);
      x.error ? p.rej(new Error(x.error.message)) : p.res(x.result);
    }
  };
});
const evl = async (e) => (await new Promise((res, rej) => { const id = ++seq; inflight.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: e, returnByValue: true } })); })).result?.value;

// rv 用原型 getter 读真实可见性——脚本伪造的那份不算
const probe = `(()=>{const v=document.querySelector('video');if(!v)return 'NOVIDEO';let rv='?';try{rv=Object.getOwnPropertyDescriptor(Document.prototype,'visibilityState').get.call(document)}catch(e){}let bfr=-1;try{const b=v.buffered;if(b.length)bfr=+(b.end(b.length-1)-v.currentTime).toFixed(1)}catch(e){}return JSON.stringify({rv,foc:document.hasFocus(),rate:v.playbackRate,muted:v.muted,t:+v.currentTime.toFixed(1),rs:v.readyState,bfr,d:+(v.duration||0).toFixed(1),paused:v.paused,name:(document.body.innerText.match(/视频：[^\\n]*/)||['?'])[0].slice(0,40),wall:Date.now()})})()`;
const parse = (s) => (s === 'NOVIDEO' ? null : JSON.parse(s));

const series = [];
for (let i = 0; i < 16; i++) {
  const s = parse(await evl(probe));
  if (s) series.push(s);
  await sleep(2000);
}
const a = series[0], b = series[series.length - 1];
if (!a || !b) {
  console.error('采样失败');
  process.exit(1);
}
const dt = b.t - a.t, dw = (b.wall - a.wall) / 1000;
console.log('当前：', JSON.stringify(b));
console.log('逐 2 秒(视频秒/真可见V或H/缓冲):', series.map((s, i) => `${i ? (s.t - series[i - 1].t).toFixed(1) : s.t}${s.rv === 'visible' ? 'V' : 'H'}${s.bfr}`).join(' '));
console.log(`真可见=${series.every((s) => s.rv === 'visible')} 焦点=${series.filter((s) => s.foc).length}/${series.length} rate=${[...new Set(series.map((s) => s.rate))].join('/')} 静音=${[...new Set(series.map((s) => s.muted))].join('/')} 暂停过=${series.some((s) => s.paused)}`);
console.log(`有效倍速 = ${dt.toFixed(1)}s 视频 / ${dw.toFixed(1)}s 墙钟 = ${(dt / dw).toFixed(2)}x`);
ws.close();
process.exit(0);
