// 他质疑得对，这条必须当场验清楚：面板起播失败，到底是「合成事件不受信」还是「我根本没点到带逻辑的元素」。
// 四种起播方式各跑一次，每次重新加载页面（避免上一次的播放器状态串味），只测两个量：
//   ① 视频在不在推进（画面没动 = 这一发没命中，样本作废，不能算"服务端拒绝"）
//   ② updateStudyVideoPlan 心跳次数 + 服务端 haveTime 增量（这才是记账）
// 顺序：A 纯 v.play() → B 元素 .click() 合成 → C 整套指针事件合成 → D 可信 CDP 点击（正对照，
// 拿它证明这套测量本身能测出心跳；D 若是 0，整轮作废，不能反过来判"面板方案不行"）。
// 上一版跑到 C 就死了：整页导航会把这条 CDP 连接带走，所以改成**每个相位各开一条连接**。
//   node .cdp/trusted-vs-synthetic.mjs          跑全部
//   node .cdp/trusted-vs-synthetic.mjs C D      只跑指定相位
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9225';
const ONLY = process.argv.slice(2).map((s) => s.toUpperCase());
const toSec = (t) => String(t || '0:0:0').split(':').reduce((a, p) => a * 60 + (parseInt(p, 10) || 0), 0);

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
  const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.value; };
  return { url: tabs[0].url, ws, send, evl, NET, J: async (e) => JSON.parse(await evl(e)) };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FIRES = {
  A: { name: 'A 纯 v.play()', note: '组件状态机不认', run: async (c) => { await c.evl('(()=>{const v=document.querySelector("video");v.play().catch(()=>{});return 1})()'); return 'play()'; } },
  B: { name: 'B 元素 .click()', note: 'isTrusted=false', run: async (c) => { const b = await c.J(BTN); if (b.none) return '找不到按钮'; await c.evl(`(()=>{document.querySelector('.d-play-btn, [class*=play-btn]').click();return 1})()`); return b.cls; } },
  C: { name: 'C 整套指针事件', note: 'isTrusted=false，含 pointerdown/up', run: async (c) => { const b = await c.J(BTN); if (b.none) return '找不到按钮'; await c.evl(`(()=>{const b=document.querySelector('.d-play-btn, [class*=play-btn]');for(const t of ['pointerover','pointerenter','pointerdown','mousedown','pointerup','mouseup','click']){const E=t.startsWith('pointer')?PointerEvent:MouseEvent;b.dispatchEvent(new E(t,{bubbles:true,cancelable:true,view:window}));}return 1})()`); return b.cls; } },
  D: { name: 'D 可信 CDP 点击', note: '正对照：量不到心跳就是这套测量坏了', run: async (c) => { const b = await c.J(BTN); if (b.none || !b.w) return '按钮不可点'; await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.x, y: b.y, button: 'left', clickCount: 1, buttons: 1 }); await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1, buttons: 0 }); return `${b.cls}@${Math.round(b.x)},${Math.round(b.y)}`; } },
};
const BTN = `JSON.stringify((()=>{const b=document.querySelector('.d-play-btn, [class*=play-btn]');if(!b)return{none:1};
  const x=b.getBoundingClientRect();return{x:x.left+x.width/2,y:x.top+x.height/2,w:Math.round(x.width),h:Math.round(x.height),cls:String(b.className).slice(0,40)}})())`;

const rows = [];
for (const k of Object.keys(FIRES)) {
  if (ONLY.length && !ONLY.includes(k)) continue;
  const F = FIRES[k];
  let c;
  try { c = await open(); } catch (e) { console.log(`  ${F.name}：连不上 —— ${e.message}`); continue; }
  await c.send('Page.enable'); await c.send('Network.enable');
  await c.send('Page.navigate', { url: c.url });      // 重新加载，把播放器状态清回"没起播"
  await sleep(14000);
  const have = async () => c.J(`(async()=>{const t=localStorage.getItem('token2'),me=JSON.parse(localStorage.getItem('userInfo2')||'{}'),q=new URLSearchParams(location.search);
    const d=await fetch('/gateway/system/orgStudent/myCourseDetails?studentId='+(me.studyNumber||me.id)+'&id='+q.get('id')+'&majorId='+me.majorId+'&studentCourseId='+q.get('studentCourseId')+'&version='+(q.get('version')||'BK_RJGC_2024'),{headers:{Authorization:t}}).then(r=>r.json()).catch(()=>({}));
    return JSON.stringify({have:(d.data&&d.data.haveTime)||'0:0:0'})})()`);
  const vid = () => c.J(`JSON.stringify((()=>{const v=document.querySelector('video');return v?{cur:+v.currentTime.toFixed(1),paused:v.paused}:{noVideo:1}})())`);
  c.NET.plans = 0;
  const before = await have();
  const v1 = await vid();
  if (v1.noVideo) { console.log(`  ${F.name}：这一页没有 <video>，作废`); try { c.ws.close(); } catch (e) { } continue; }
  const hit = await F.run(c);
  await sleep(20000);
  const v2 = await vid();
  const after = await have();
  const advanced = v2.cur - v1.cur;
  const grew = toSec(after.have) - toSec(before.have);
  const verdict = advanced > 2 ? (c.NET.plans > 0 && grew > 0 ? '播了且记账' : '播了但不记账') : '没播起来';
  rows.push({ k, name: F.name, advanced: Math.round(advanced), beats: c.NET.plans, grew, verdict });
  console.log(`  ${F.name}（${F.note}）：命中=${hit} | 20s 进度推进 ${Math.round(advanced)}s → ${v2.paused ? '仍停着' : '在播'} | 心跳 ${c.NET.plans} 次 | haveTime +${grew}s | 判：${verdict}`);
  try { c.ws.close(); } catch (e) { }
}

const D = rows.filter((r) => r.k === 'D')[0];
console.log('\n结论：');
if (!D) console.log('  没跑正对照 D，下面的判读都缺一个基准');
else if (!(D.beats > 0)) console.log(`  ✗ 正对照（可信点击）心跳 ${D.beats}、haveTime +${D.grew}s —— 这套测量本身不成立，整轮作废，别拿它判任何结论`);
else {
  console.log(`  ✓ 正对照成立：可信点击 → 心跳 ${D.beats} 次、haveTime +${D.grew}s —— 说明"能记上账"这条路是通的，测量也是灵的`);
  const syn = rows.filter((r) => r.k === 'B' || r.k === 'C');
  const played = syn.filter((r) => r.advanced > 2);
  if (!played.length) console.log('  合成事件连画面都没推动 → 是"没命中播放器的逻辑"，不是"服务端拒绝"，面板起播这条路得重新找元素');
  else if (played.every((r) => r.beats === 0)) console.log('  合成事件把画面推进了但零心跳零记账 → 差的确实只有"可信"这一层，油猴拿不到，起播只能人点');
  else console.log('  合成事件里有一种能记账 → 我之前的结论错了，面板可以自己起播');
  const A = rows.filter((r) => r.k === 'A')[0];
  if (A) console.log(`  纯 play()：推进 ${A.advanced}s、心跳 ${A.beats}、haveTime +${A.grew}s → ${A.verdict}`);
}
process.exit(0);
