// 探测：只给 courseUnitId 时，播放器加载后 URL 是否会补出 videoId
//   node probe-node.mjs <tabId前缀> <courseId> <studentCourseId> <courseUnitId>
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const [,, TABID, CID, SCID, UNIT] = process.argv;
const VERSION = 'BK_RJGC_2024', MAJOR = '9f07cf1e06d0a57957bd6be34efd3930';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pages = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const tab = pages.find((t) => t.id.startsWith(TABID));
if (!tab) {
  console.error('找不到标签页', TABID);
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

// 把这个探测页带到前台，否则 Chrome 不加载媒体（上次的结论就是因此无效）
const ver = await (await fetch(BASE + '/json/version')).json();
const bws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
bws.send(JSON.stringify({ id: 1, method: 'Target.activateTarget', params: { targetId: tab.id } }));
await sleep(900);

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=${CID}&studentCourseId=${SCID}&version=${VERSION}&courseUnitId=${UNIT}&majorId=${MAJOR}` });
const probe = `(() => { const u = new URL(location.href); const v = document.querySelector('video'); return JSON.stringify({ vid: u.searchParams.get('videoId'), hasV: !!v, d: v ? +(v.duration||0).toFixed(1) : 0, t: v ? +v.currentTime.toFixed(1) : 0, paused: v ? v.paused : true, label: (document.body.innerText.match(/视频：[^\\s]{0,26}/)||[''])[0] }); })()`;
for (let i = 0; i < 12; i++) {
  await sleep(2000);
  const s = JSON.parse(await evl(probe));
  console.log(`  第${i + 1}次`, JSON.stringify(s));
  if (s.hasV && s.d > 0) {
    // 真实点击起播，看播放器初始化后会不会往 URL 里写 videoId
    const box = JSON.parse(await evl(`(() => { const v = document.querySelector('video'); const r = v.getBoundingClientRect(); return JSON.stringify({x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2)}); })()`));
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y, buttons: 0 });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 0 });
    await sleep(6000);
    console.log('  点击后', await evl(probe));
    break;
  }
}
bws.close();
ws.close();
process.exit(0);
