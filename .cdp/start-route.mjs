// 上一轮的正对照（可信点击）自己失败了：心跳 0。原因是窗口停在 -32000 屏幕外，页面 native hidden，
// 这时候 CDP 的 Input 事件根本不会送进渲染进程 —— 所以那轮"没播起来"全是测量坏了，不是结论。
// 这一轮先把窗口挪回屏内（native 才会 visible，可信输入才会生效），并补上 runner 一直在用、
// 且被证明能记账的那条路：**可信空格**。
// 每个相位各开一条 CDP 连接（整页导航会把连接带走），并且都回显 elementFromPoint 命中了谁 ——
// 判"点了没反应"要分三层：页面是否 native visible / 命中的是不是这个元素 / 这个元素是否真绑了逻辑。
//   node .cdp/start-route.mjs            全部
//   node .cdp/start-route.mjs D E G      只跑指定相位
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9225';
const ONLY = process.argv.slice(2).map((s) => s.toUpperCase());
const toSec = (t) => String(t || '0:0:0').split(':').reduce((a, p) => a * 60 + (parseInt(p, 10) || 0), 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open() {
  const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('/MyCourse/Study'));
  if (!tabs.length) throw new Error('没有学习页');
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const pend = new Map(); const NET = { plans: 0 };
  ws.onmessage = (e) => {
    const x = JSON.parse(e.data);
    if (x.method === 'Network.requestWillBeSent' && String(x.params?.request?.url || '').includes('updateStudyVideoPlan')) NET.plans++;
    if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); }
  };
  const send = (m, p = {}) => new Promise((res, rej) => {
    const id = ++seq; pend.set(id, { res, rej });
    try { ws.send(JSON.stringify({ id, method: m, params: p })); } catch (e) { pend.delete(id); rej(e); }
  });
  const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 140); return r.result?.value; };
  return { url: tabs[0].url, targetId: tabs[0].id, ws, send, evl, NET, J: async (e) => JSON.parse(await evl(e)) };
}

// 播放器上所有"看起来能点"的元素 + 中心命中测试
const PROBE = `JSON.stringify((()=>{const b=document.querySelector('.d-play-btn, [class*=play-btn]');
  const out={btn:null,at:null,hidden:(()=>{const d=Object.getOwnPropertyDescriptor(Document.prototype,'hidden');return d.get.call(document)})()};
  if(b){const x=b.getBoundingClientRect();out.btn={cls:String(b.className).slice(0,34),x:x.left+x.width/2,y:x.top+x.height/2,w:Math.round(x.width)};
    const e=document.elementFromPoint(out.btn.x,out.btn.y);
    out.at=e?e.tagName+'.'+String(e.className).slice(0,34):'null';}
  const v=document.querySelector('video');
  out.v=v?{cur:+v.currentTime.toFixed(1),paused:v.paused,rs:v.readyState,src:(v.currentSrc||'').slice(-18)}:{none:1};
  return out})())`;
const clickAt = async (c, x, y) => {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
};
const FIRES = {
  A: { name: 'A 纯 v.play()', note: '不信也说明不了命中问题', vis: false, run: async (c) => { await c.evl('(()=>{const v=document.querySelector("video");v.play().catch(()=>{});return 1})()'); return 'play()'; } },
  B: { name: 'B 合成 .click()', note: '打在 .d-play-btn 上', vis: false, run: async (c) => { await c.evl(`(()=>{const b=document.querySelector('.d-play-btn, [class*=play-btn]');b.click();return 1})()`); return 'click()'; } },
  C: { name: 'C 合成整套指针事件', note: '打在 .d-play-btn 上', vis: false, run: async (c) => { await c.evl(`(()=>{const b=document.querySelector('.d-play-btn, [class*=play-btn]');for(const t of ['pointerover','pointerdown','mousedown','pointerup','mouseup','click']){const E=t.startsWith('pointer')?PointerEvent:MouseEvent;b.dispatchEvent(new E(t,{bubbles:true,cancelable:true,view:window}));}return 1})()`); return '7 个事件'; } },
  D: { name: 'D 可信点击 .d-play-btn 中心', note: '正对照一', vis: true, run: async (c) => { const p = await c.J(PROBE); if (!p.btn || !p.btn.w) return '按钮没尺寸'; await clickAt(c, p.btn.x, p.btn.y); return `@${Math.round(p.btn.x)},${Math.round(p.btn.y)} 命中=${p.at}`; } },
  E: { name: 'E 可信空格（runner 用的那条）', note: '正对照二', vis: true, run: async (c) => { for (const type of ['keyDown', 'keyUp']) await c.send('Input.dispatchKeyEvent', { type, key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, text: ' ' }); return 'Space'; } },
  G: { name: 'G 合成事件打在 elementFromPoint 命中的元素上', note: '排除"点错元素"', vis: false, run: async (c) => {
    const p = await c.J(PROBE);
    const r = await c.evl(`(()=>{const b=document.querySelector('.d-play-btn, [class*=play-btn]');const x=b.getBoundingClientRect();
      const e=document.elementFromPoint(x.left+x.width/2,x.top+x.height/2);if(!e)return 'null';
      for(const t of ['pointerover','pointerdown','mousedown','pointerup','mouseup','click']){const E=t.startsWith('pointer')?PointerEvent:MouseEvent;e.dispatchEvent(new E(t,{bubbles:true,cancelable:true,view:window}));}
      return e.tagName+'.'+String(e.className).slice(0,34)})()`);
    return String(r); } },
};

// 窗口必须先回屏内：屏幕外 = native hidden，可信输入不会送进渲染进程
const ver = await (await fetch(BASE + '/json/version')).json();
const bws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
const bp = new Map();
bws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && bp.has(x.id)) { const f = bp.get(x.id); bp.delete(x.id); f(x.result); } };
let bid = 0;
const bask = (method, params) => new Promise((r) => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
const first = await open();
const win = await bask('Browser.getWindowForTarget', { targetId: first.targetId });
try { first.ws.close(); } catch (e) { }
await bask('Browser.setWindowBounds', { windowId: win.windowId, bounds: { left: 100, top: 100, width: 1180, height: 780, windowState: 'normal' } });
await sleep(2500);
console.log('窗口已挪到屏内（测完挪回屏幕外）');

const rows = [];
for (const k of Object.keys(FIRES)) {
  if (ONLY.length && !ONLY.includes(k)) continue;
  const F = FIRES[k];
  let c;
  try { c = await open(); } catch (e) { console.log(`  ${F.name}：连不上 —— ${e.message}`); continue; }
  await c.send('Page.enable'); await c.send('Network.enable');
  await c.send('Page.navigate', { url: c.url });
  await sleep(14000);
  const have = async () => c.J(`(async()=>{const t=localStorage.getItem('token2'),me=JSON.parse(localStorage.getItem('userInfo2')||'{}'),q=new URLSearchParams(location.search);
    const d=await fetch('/gateway/system/orgStudent/myCourseDetails?studentId='+(me.studyNumber||me.id)+'&id='+q.get('id')+'&majorId='+me.majorId+'&studentCourseId='+q.get('studentCourseId')+'&version='+(q.get('version')||'BK_RJGC_2024'),{headers:{Authorization:t}}).then(r=>r.json()).catch(()=>({}));
    return JSON.stringify({have:(d.data&&d.data.haveTime)||'0:0:0'})})()`);
  c.NET.plans = 0;
  // 可信输入必须页面 native visible，否则事件根本进不了渲染进程；合成事件不吃这一套，所以只标不拦
  let vis = null;
  for (let i = 0; i < 3; i++) {
    await bask('Browser.setWindowBounds', { windowId: win.windowId, bounds: { left: 100, top: 100, width: 1180, height: 780, windowState: 'normal' } });
    await c.send('Page.bringToFront');
    await sleep(2500);
    vis = (await c.J(PROBE)).hidden === false;
    if (vis) break;
  }
  if (!vis && F.vis) { console.log(`  ${F.name}：反复确认过，页面仍然 native hidden —— 环境不给可信输入，这一相位作废`); try { c.ws.close(); } catch (e) { } continue; }
  const before = await have();
  const p1 = await c.J(PROBE);
  if (!p1.v || p1.v.none) { console.log(`  ${F.name}：没有 <video>，作废`); try { c.ws.close(); } catch (e) { } continue; }
  const hit = await F.run(c);
  await sleep(20000);
  const p2 = await c.J(PROBE);
  const advanced = p2.v.cur - p1.v.cur;
  const grew = toSec((await have()).have) - toSec(before.have);
  const verdict = advanced > 2 ? (c.NET.plans > 0 && grew > 0 ? '播了且记账' : '播了但不记账') : '没播起来';
  rows.push({ k, name: F.name, advanced: Math.round(advanced), beats: c.NET.plans, grew, verdict });
  console.log(`  ${F.name}（${F.note}）：native visible=${vis} ${hit} | 20s 推进 ${Math.round(advanced)}s → ${p2.v.paused ? '仍停着' : '在播'} | 心跳 ${c.NET.plans} | haveTime +${grew}s | 判：${verdict}`);
  try { c.ws.close(); } catch (e) { }
}

const good = rows.filter((r) => r.k === 'D' || r.k === 'E').filter((r) => r.beats > 0);
console.log('\n结论：');
if (!good.length) console.log('  ✗ 两条正对照（可信点击 / 可信空格）都没量到心跳 —— 测量或环境坏了，下面所有"没播起来"都不能当结论');
else {
  console.log(`  ✓ 正对照成立：${good.map((r) => `${r.k}（心跳 ${r.beats}、haveTime +${r.grew}s）`).join('、')} —— 这条路能记账，测量也是灵的`);
  const syn = rows.filter((r) => r.k === 'B' || r.k === 'C' || r.k === 'G');
  const played = syn.filter((r) => r.advanced > 2);
  if (!played.length) console.log('  合成事件（含打在 elementFromPoint 命中元素上的那次）都没把画面推动 → 面板拿合成事件起播这条路是死的，不是"点错元素"');
  else if (played.every((r) => r.beats === 0)) console.log('  合成事件推动了画面但零心跳零记账 → 差的确实只有"可信"这一层，油猴拿不到');
  else console.log('  有合成事件能记账 → 我之前的结论错了，面板可以自己起播，得改');
}
const A = rows.filter((r) => r.k === 'A')[0];
if (A) console.log(`  纯 play()：推进 ${A.advanced}s、心跳 ${A.beats}、haveTime +${A.grew}s → ${A.verdict}`);
await bask('Browser.setWindowBounds', { windowId: win.windowId, bounds: { left: -32000, top: -32000, width: 1280, height: 800, windowState: 'normal' } });
console.log('窗口已挪回屏幕外');
bws.close(); process.exit(0);
