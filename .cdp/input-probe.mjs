// 判定合成输入到底有没有送达页面：挂捕获计数器，再发事件，看计数是否增加、用户激活态是否建立
//   node .cdp/input-probe.mjs
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || '').slice(0, 200); return r.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const guard = async () => { const { windowId } = await send('Browser.getWindowForTarget', { targetId: page.id }); const b = await send('Browser.getWindowBounds', { windowId }); if (b.bounds.windowState !== 'normal') await send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } }); return b.bounds.windowState; };

await send('Page.enable'); await send('Runtime.enable');
console.log('窗口:', await guard());
console.log(await evl(`(()=>{
  window.__ev={};
  for(const k of ['pointerdown','pointerup','mousedown','mouseup','click','dblclick','keydown','keyup','touchstart','touchend','play']){
    document.addEventListener(k,(e)=>{window.__ev[k]=(window.__ev[k]||0)+1;
      if(k==='click'||k==='pointerdown'){const t=e.target;window.__last=String(t.tagName)+'.'+String(t.className).slice(0,30)}},true);
  }
  return '计数器已挂'
})()`));
const box = JSON.parse((await evl(`(()=>{const v=document.querySelector('video');if(!v)return '{}';const r=v.getBoundingClientRect();return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),paused:v.paused})})()`)) || '{}');
console.log('播放器中心:', JSON.stringify(box), ' 事件计数初值:', await evl('JSON.stringify(window.__ev||{})'));

const click = async (x, y) => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mousePressed' ? 'left' : 'none', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 }); };

console.log('\n--- ① 只发 pointer 事件（有些前端只监听 pointerdown）---');
for (const type of ['pointerPressed', 'pointerReleased']) { await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: type === 'pointerPressed' ? 1 : 0 }).catch((e) => console.log('  pointer 事件不支持:', String(e.message).slice(0, 80))); }
await sleep(1500);
console.log('  计数:', await evl('JSON.stringify(window.__ev)'), ' paused=', await evl('document.querySelector("video").paused'));

console.log('\n--- ② 标准 mouse 三连（runner 用的就是这个）---');
await click(box.x, box.y);
await sleep(2000);
console.log('  计数:', await evl('JSON.stringify(window.__ev)'));
console.log('  最后命中的元素:', await evl('String(window.__last)'));
console.log('  视频状态:', await evl(`(()=>{const v=document.querySelector('video');return JSON.stringify({paused:v.paused,t:+v.currentTime.toFixed(1)})})()`));
console.log('  navigator.userActivation:', await evl(`(()=>{try{return JSON.stringify({active:navigator.userActivation.hasBeenActive,sticky:navigator.userActivation.isActive})}catch(e){return '不支持'}})()`));

console.log('\n--- ③ 键盘空格（另一条可信输入路径）---');
await evl(`(()=>{const v=document.querySelector('video');v&&v.focus();return 1})()`);
for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: ' ', code: 'Space', text: ' ', windowsVirtualKeyCode: 32 }).catch((e) => console.log('  键盘事件失败', String(e.message).slice(0, 60)));
await sleep(2000);
console.log('  计数:', await evl('JSON.stringify(window.__ev)'));
console.log('  视频状态:', await evl(`(()=>{const v=document.querySelector('video');return JSON.stringify({paused:v.paused,t:+v.currentTime.toFixed(1)})})()`));

console.log('\n--- ④ 直接调 v.play() 作对照（脚本路径，非可信输入）---');
await evl(`(()=>{const v=document.querySelector('video');v.muted=true;v.play().catch(()=>{})})()`);
await sleep(3000);
console.log('  视频状态:', await evl(`(()=>{const v=document.querySelector('video');return JSON.stringify({paused:v.paused,t:+v.currentTime.toFixed(1)})})()`));
console.log('\n判读：②的计数若为 0 → 合成输入根本没送达 DOM；计数有增长但视频不动 → 送达了、是该控件没有绑定播放逻辑。');
ws.close(); process.exit(0);
