// 验证油猴脚本的默认静音 + 静音是否让自动播放策略放行
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const fs = await import('node:fs');
const path = await import('node:path');
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'hailang-background-play.user.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pages = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
let runnerId = null;
try {
  runnerId = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id;
} catch (e) {}
const tab = pages.find((t) => t.url.includes('study.cqie.edu.cn') && t.id !== runnerId);
if (!tab) {
  console.error('没有空闲标签页');
  process.exit(1);
}
let seq = 0;
const inflight = new Map();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
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

const ver = await (await fetch(BASE + '/json/version')).json();
const bws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
const bact = (id) => bws.send(JSON.stringify({ id: Math.random(), method: 'Target.activateTarget', params: { targetId: id } }));
// 媒体只在前台标签页加载，所以测之前必须把探测页顶到前台
bact(tab.id);
await sleep(1200);

await send('Page.enable');
await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: SRC });
await send('Page.navigate', { url: 'https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=4fafa68754ee9872feb67b4cda5f2c4f&studentCourseId=255b69a5ce54ba7a2c6caa5321b323f7&version=BK_RJGC_2024&courseUnitId=637e13855783d8a848d38a25bded5d2f&videoId=26eb45aadf79b473f4f5f45545c709ec&majorId=9f07cf1e06d0a57957bd6be34efd3930' });

const probe = `(()=>{const v=document.querySelector('video');if(!v)return 'NOVIDEO';return JSON.stringify({muted:v.muted,volume:+v.volume.toFixed(2),rate:v.playbackRate,paused:v.paused,t:+v.currentTime.toFixed(1),d:+(v.duration||0).toFixed(1)})})()`;
let first = null;
for (let i = 0; i < 20; i++) {
  await sleep(2000);
  first = await evl(probe);
  if (first !== 'NOVIDEO' && JSON.parse(first).d > 0) break;
}
console.log('加载后（未做任何点击）:', first);
// 站点播放器不主动起播，这里模拟 runner 的行为把它播起来，才能验倍速是否真生效
await evl(`(()=>{const v=document.querySelector('video');if(v){v.muted=true;}return v?v.play().then(()=>'ok').catch(e=>'rej:'+e.name):'NOVIDEO'})()`);
await sleep(6000);
const second = await evl(probe);
console.log('6 秒后:', second);
const a = JSON.parse(first), b = JSON.parse(second);
console.log('静音生效:', a.muted === true, '| 音量保留:', a.volume, '| 倍速:', b.rate, '| 倍速推进量/6秒:', +(b.t - a.t).toFixed(1), 's（2 倍速应约 12s）');
console.log('无人工手势就在播（说明 muted 绕过了自动播放限制）:', a.paused === false && b.t > a.t);
// 把前台还给正在跑课的 runner，别让它下一支视频卡在加载
if (runnerId) bact(runnerId);
await sleep(600);
bws.close();
ws.close();
process.exit(0);
