// 「切窗口就停」的正经 A/B 受控对照。上一版（panel-resume.mjs）不成立，两个原因：
//   ① 9225 里 Tampermonkey 装的是 v0.2.0，不是我要对照的 v0.3.2；
//   ② 那个窗口停在屏幕外，页面**原生就是 hidden**，正好绕过 v0.3.2 那道 reallyHidden() 门 ——
//      于是 A 阶段测的根本不是「切窗口（visible 失焦）」那条分支。
// 这一版把变量收干净：在 9224（headless=new，原生 visible）上，同一个页面、同一个条件，
// 只换面板构建 —— 先注入 git HEAD 的 v0.3.2，再注入工作区的 v0.3.3，各程序化 pause 一次。
// 预期：v0.3.2 不回（这就是他看到的「直接暂停」），v0.3.3 当场回。
//   node .cdp/panel-resume2.mjs
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = 'D:/Workspace/Code_Projects/hailang-AutoCourse';
const NEW_SRC = fs.readFileSync(ROOT + '/hailang-panel.user.js', 'utf8');
const OLD_SRC = execFileSync('git', ['show', 'HEAD:hailang-panel.user.js'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 4e6 });
const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
if (!tabs.length) { console.error('9224 没标签'); process.exit(1); }
const tab = tabs[0];
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200); return r.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = async (e) => JSON.parse(await evl(e));
await send('Page.enable'); await send('Network.enable');

const nat = () => J(`JSON.stringify((()=>{const h=Object.getOwnPropertyDescriptor(Document.prototype,'hidden').get.call(document);
  return{hidden:h,vs:Object.getOwnPropertyDescriptor(Document.prototype,'visibilityState').get.call(document)}})())`);
const stt = () => J(`JSON.stringify((()=>{const v=document.querySelector('video');
  return{noVideo:!v,paused:v?v.paused:null,cur:v?+v.currentTime.toFixed(1):-1,dur:v?+(v.duration||0).toFixed(1):-1,
  ver:(window.__kgPanel||{}).version||null,resumes:(window.__kgPanel&&window.__kgPanel.G)?(window.__kgPanel.G.pauses||0):null}})())`);

// 窗口位置：只有真正在屏内才会是 native visible。这一步会把测试实例的窗口提到前台一次，
// 测完（含中途失败）立刻挪回屏幕外，不做持续抢焦点。
const ver0 = await (await fetch(BASE + '/json/version')).json();
const bws = new WebSocket(ver0.webSocketDebuggerUrl);
await new Promise((r) => (bws.onopen = r));
const bp = new Map();
bws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && bp.has(x.id)) { const f = bp.get(x.id); bp.delete(x.id); f(x.result); } };
let bid = 0;
const bask = (method, params) => new Promise((r) => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
const win = await bask('Browser.getWindowForTarget', { targetId: tab.id });
const moveWindow = async (onscreen) => {
  await bask('Browser.setWindowBounds', { windowId: win.windowId, bounds: onscreen ? { left: 120, top: 120, width: 1180, height: 760, windowState: 'normal' } : { left: -32000, top: -32000, width: 1280, height: 800, windowState: 'normal' } });
  await sleep(2000);
};
const park = async () => { try { await moveWindow(false); } catch (e) { } bws.close(); };

const pick = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');if(!t)return JSON.stringify({ok:false,why:'没有 token2，会话过期'});
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const G=(p)=>fetch(p,{headers:{Authorization:t}}).then(r=>r.json());
  const cs=await fetch('/gateway/frequent/orgStudent/pagedMyCourse',{method:'POST',headers:{Authorization:t,'Content-Type':'application/json'},body:JSON.stringify({filters:{courseNature:null,name:'',schoolYear:'',studentId:String(me.id),term:'',courseFlag:0},pageIndex:1,pageSize:50})}).then(r=>r.json());
  if(!cs.data)return JSON.stringify({ok:false,why:'接口没返回课程：'+String(cs.msg||cs.code||'').slice(0,40)});
  const cl=(cs.data&&(cs.data.records||cs.data.list))||[];let best=null;
  for(const c of cl){
    const sid=c.studentCourseId||c.id;
    const pd=await G('/gateway/system/orgStudent/progressDetails?studentId='+(me.studyNumber||me.id)+'&id='+c.id+'&majorId='+me.majorId+'&studentCourseId='+sid+'&version='+(c.version||'BK_RJGC_2024'));
    const vids=[];const walk=(n)=>{for(const v of (n.courseCatalogVideoVos||[]))vids.push({id:v.id,unitId:v.unitId||n.id,name:v.name,len:v.timeLength||0});for(const k of (n.children||[]))walk(k)};
    (Array.isArray(pd.data)?pd.data:[]).forEach(walk);
    for(const v of vids) if(v.len>=90&&v.len<=600&&(!best||v.len<best.len)) best={...v,cid:c.id,sid,ver:c.version||'BK_RJGC_2024',course:c.name};
  }
  return JSON.stringify(best?{ok:true,...best,stu:me.studyNumber||me.id,major:me.majorId}:{ok:false,why:'没枚举到 90~600 秒的视频'})
})()`));
if (!pick.ok) { console.error('样本无效：' + pick.why); process.exit(1); }
console.log(`账号 ${pick.stu} / 选片【${pick.course}】「${pick.name}」 ${pick.len}s`);
await send('Page.navigate', { url: `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=${pick.cid}&studentCourseId=${pick.sid}&version=${pick.ver}&courseUnitId=${pick.unitId}&majorId=${pick.major}&videoId=${pick.id}` });
await sleep(14000);
let n0 = await nat();
if (n0.hidden) { await moveWindow(true); n0 = await nat(); }
if (n0.hidden) { console.error('窗口已挪到屏内仍是 native hidden（被别的东西挡住了），测不到 visible 分支 —— 不硬解释，清场'); await park(); process.exit(1); }
console.log(`页面原生可见性：hidden=${n0.hidden}/${n0.vs}（正是要测的 visible 分支；窗口已临时挪到屏内）`);
const pre = await stt();
if (pre.ver) console.log(`  ! 页面上已经有面板 v${pre.ver}（它的监听摘不掉，A 阶段结论要打折看；headless 实例一般没装油猴）`);

const inject = async (src, label) => {
  await evl(`(()=>{window.__kgBuilt=1;window.__kgPanel=null;window.__kgOldHooks=1;const p=document.getElementById('kg-panel');if(p)p.remove();return 1})()`);
  const r = await evl(src + '\n;"ok"');
  await sleep(2200);
  const s = await stt();
  console.log(`  注入 ${label} → ${r}，页面上现在是 v${s.ver}`);
  if (s.noVideo) { console.error('  这一页没有 <video>，作废'); await park(); process.exit(1); }
  return s;
};
const pauseOnce = async (label) => {
  if ((await stt()).paused) { await evl('(()=>{const v=document.querySelector("video");v.play().catch(()=>{});return 1})()'); await sleep(1500); }
  const a = await stt();
  if (a.paused) { console.log(`  ${label}：起播失败（play() 被拒），这轮作废`); return null; }
  const nz = await nat();
  await evl('(()=>{const v=document.querySelector("video");v.pause();return 1})()');   // 纯程序化 pause，不给任何 pointer/key 事件
  const ms = [];
  for (const t of [300, 1200, 2600]) { await sleep(t - (ms.length ? ms[ms.length - 1].t : 0)); const x = await stt(); ms.push({ t, paused: x.paused, resumes: x.resumes }); }
  const back = ms.some((m) => m.paused === false);
  console.log(`  ${label}：native hidden=${nz.hidden} 时程序化 pause → ` + ms.map((m) => `${m.t}ms:${m.paused ? '停' : '播'}`).join(' ') + ` | 接手计数 ${a.resumes}→${ms[2].resumes} | ${back ? '自己回来了' : '一直是停的'}`);
  if (!back) { await evl('(()=>{const v=document.querySelector("video");v.play().catch(()=>{});return 1})()'); await sleep(1200); }
  return back;
};

const NEW_VER = (NEW_SRC.match(/@version\s+(\S+)/) || [])[1] || '?';
const OLD_VER = (OLD_SRC.match(/@version\s+(\S+)/) || [])[1] || '?';
console.log(`对照的两个构建：仓库 HEAD 是 v${OLD_VER}，工作区是 v${NEW_VER}`);

console.log('\n[A0] 页面上油猴自己装的构建（未动过）');
if (pre.ver) await pauseOnce(`as-installed v${pre.ver}`);

console.log(`\n[A] 只装 v${OLD_VER}（git HEAD）`);
await inject(OLD_SRC, `v${OLD_VER}`);
const A = await pauseOnce(`v${OLD_VER}`);

console.log(`\n[B] 换成 v${NEW_VER}（工作区）`);
await inject(NEW_SRC, `v${NEW_VER}`);
const B = await pauseOnce(`v${NEW_VER}`);

console.log(`\n[C] 可信点击播放器自己的控件 = 用户意图，v${NEW_VER} 应当不接手`);
const cands = await J(`JSON.stringify((()=>{const out=[];
  for(const b of document.querySelectorAll('video, .dplayer, [class*=play], [class*=control]')){
    if(b.closest('#kg-panel'))continue;const x=b.getBoundingClientRect();
    if(x.width<8||x.height<8)continue;
    out.push({tag:b.tagName,cls:String(b.className).slice(0,50),x:x.left+x.width/2,y:x.top+x.height/2,inSel:!!(b.closest&&b.closest('video, .dplayer, [class*=player], [class*=play], [class*=control]'))});}
  return out.slice(0,14)})())`);
console.log(`  候选控件 ${cands.length} 个：` + cands.map((c) => `${c.tag}.${c.cls}`).slice(0, 6).join(' / '));
let C = null;
for (const c of cands) {
  if (!c.inSel) continue;
  const b = await stt();
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1, buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(120);
  const m = await stt();
  if (m.paused !== true || b.paused === true) continue;      // 这一下没造成「用户在播着的时候按停」，换下一个控件
  await sleep(3500);
  const m2 = await stt();
  C = { c: `${c.tag}.${c.cls}`, stayed: m2.paused === true, resumes: `${m.resumes}→${m2.resumes}` };
  break;
}
console.log(C ? `  点了 ${C.c} → 暂停${C.stayed ? '留得住 ✓（尊重用户意图）' : '被面板抢回来了 ✗'} | 接手计数 ${C.resumes}`
  : '  没找到「播着时点一下会暂停」的控件（无头里播放器 UI 可能没渲染），C 判不了，不当作已验证');

console.log(`\n判定：A(v${OLD_VER}) ${A === null ? '作废' : A ? '居然回来了——visible 分支假设不成立，别再讲这个故事' : '停在原地，复现「切窗口就停」'} | B(v${NEW_VER}) ${B === null ? '作废' : B ? '当场接手，修复有效' : '仍不回，修复无效，别推'}`);
await park();
console.log('测试实例窗口已挪回屏幕外');
ws.close(); process.exit(0);
