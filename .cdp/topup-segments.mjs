// 分段补齐：把"整片时长已满但某些分段 status!=2"的视频从 0 重播，直到分段全部完成。
// 为什么需要：平台按分段（任务说明/任务分析/知识讲解…）分别判定完成，整片 stopPos 到位
// 不代表每个时间区间都被覆盖过；被 seek 越过或重载后跳过的分段会永久未完成，
// 而关卡侧 studyVideoStatus 与课程级 haveTime 都盖不住这种缺口。
// 用法：
//   node .cdp/topup-segments.mjs                 # 默认前端框架开发技术，只处理有缺口的视频
//   node .cdp/topup-segments.mjs <课程名关键词> --dry
// 起播沿用 runner 的结论：必须用可信键盘事件（Input.dispatchKeyEvent 空格），v.play() 不记账。
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.argv[2] || '前端框架开发技术';
const DRY = process.argv.includes('--dry');
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ver = await (await fetch(BASE + '/json/version')).json().catch(() => null);
if (!ver) { console.error('CDP 不可用：先跑 .cdp/launch-headless-url.ps1 或 runner'); process.exit(1); }
const bws = new WebSocket(ver.webSocketDebuggerUrl);
const bp = new Map(); let bid = 0;
await new Promise((r) => (bws.onopen = r));
bws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && bp.has(x.id)) { const p = bp.get(x.id); bp.delete(x.id); p(x.result); } };
const bask = (method, params) => new Promise((res) => { const id = ++bid; bp.set(id, res); bws.send(JSON.stringify({ id, method, params })); });

const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && t.url.includes('study.cqie.edu.cn'));
if (!tabs.length) { console.error('没有 study 标签页'); process.exit(1); }
const tab = tabs[0];
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.exception?.description || '').slice(0, 150); return r.result?.value; };
await send('Page.enable'); await send('Runtime.enable');

// 窗口必须可见：minimized → document.hidden → Chrome 推迟媒体加载（duration=null、readyState=0）
async function assertVisible() {
  const { windowId } = await bask('Browser.getWindowForTarget', { targetId: tab.id });
  const b = await bask('Browser.getWindowBounds', { windowId });
  if (b.bounds.windowState !== 'normal') await bask('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
  const after = await bask('Browser.getWindowBounds', { windowId });
  const hidden = await evl('document.hidden');
  return { state: after.bounds.windowState, hidden };
}

const gapsOf = async () => JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const cs=await fetch('/gateway/frequent/orgStudent/pagedMyCourse',{method:'POST',headers:H,body:JSON.stringify({filters:{courseNature:null,name:'',schoolYear:'',studentId:me.id,term:'',courseFlag:0},pageIndex:1,pageSize:50})}).then(r=>r.json());
  const c=((cs.data&&(cs.data.records||cs.data.list))||[]).find(x=>String(x.name||'').includes(${JSON.stringify(KEY)}));
  if(!c) return JSON.stringify({err:'没这门课'});
  const sid=c.studentCourseId||c.id, ver=c.version||'BK_RJGC_2024';
  const pd=await fetch('/gateway/system/orgStudent/progressDetails?studentId='+(me.studyNumber||me.id)+'&id='+c.id+'&majorId='+me.majorId+'&studentCourseId='+sid+'&version='+ver,{headers:{Authorization:t}}).then(r=>r.json());
  const out=[];
  const walk=(n)=>{ for(const v of (n.courseCatalogVideoVos||[])){
      const segs=v.courseCatalogVideoSegments||[];
      const miss=segs.filter(s=>s.status!==2).map(s=>s.segmentName||String(s.sortCode));
      if(segs.length&&miss.length) out.push({unitId:v.unitId||n.id,videoId:v.id,name:v.name,len:v.timeLength,have:v.haveTime,miss});
    } for(const ch of (n.children||[])) walk(ch); };
  (Array.isArray(pd.data)?pd.data:[]).forEach(walk);
  return JSON.stringify({course:c.name,cid:c.id,sid,ver,majorId:me.majorId,gaps:out})
})()`));

const st = await assertVisible();
console.log(`窗口状态=${st.state} document.hidden=${st.hidden}${st.hidden ? '  ← 媒体会被推迟，先把窗口置前' : ''}`);
let info = await gapsOf();
if (info.err) { console.error(info.err); process.exit(1); }
console.log(`课程「${info.course}」 有分段缺口的视频 ${info.gaps.length} 条`);
for (const g of info.gaps) console.log(`  ${String(g.name).padEnd(28)} 时长${g.have}/${g.len}  缺: ${g.miss.join('、')}`);
if (!info.gaps.length) { console.log('无需补齐'); process.exit(0); }
if (DRY) { console.log('\n（--dry：只报告，不播放）'); process.exit(0); }

for (const g of info.gaps) {
  console.log(`\n▶ 从 0 重播「${g.name}」（${g.len}s，缺 ${g.miss.length} 段）`);
  const url = `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=${info.cid}&studentCourseId=${info.sid}&version=${info.ver}&courseUnitId=${g.unitId}&videoId=${g.videoId}&majorId=${info.majorId}`;
  await send('Page.navigate', { url });
  await sleep(14000);
  await assertVisible();
  // 等媒体就绪再从头播
  let dur = 0;
  for (let i = 0; i < 20; i++) {
    dur = Number(await evl('(()=>{const v=document.querySelector("video");return v?v.duration:0})()')) || 0;
    if (dur > 0) break;
    await sleep(3000); await assertVisible();
  }
  if (!dur) { console.log('  ✗ 拿不到时长，跳过（多半是窗口 hidden 或媒体未加载）'); continue; }
  await evl('(()=>{const v=document.querySelector("video");v.muted=true;try{v.currentTime=0}catch(e){}try{v.focus()}catch(e){}return 1})()');
  for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: ' ', code: 'Space', text: ' ', windowsVirtualKeyCode: 32 }).catch(() => {});
  await sleep(2500);
  let rate = Number(await evl('(()=>{const v=document.querySelector("video");try{v.playbackRate=2}catch(e{});return v?v.playbackRate:0})()')) || 0;
  console.log(`  时长 ${dur.toFixed(0)}s、倍速 ${rate}x，开始覆盖播放`);
  let last = -1, same = 0;
  for (let i = 0; i < 200; i++) {
    await sleep(6000);
    const s = await evl('(()=>{const v=document.querySelector("video");return JSON.stringify([v?v.currentTime:-1,v?v.ended:false,v?!v.paused:false])})()');
    const [pos, ended, playing] = JSON.parse(String(s));
    if (ended) { console.log(`  ✓ 播到片尾 ${pos.toFixed(0)}s`); break; }
    if (!playing) { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: ' ', code: 'Space', text: ' ', windowsVirtualKeyCode: 32 }).catch(() => {}); await assertVisible(); }
    if (Math.abs(pos - last) < 1) { same++; if (same > 6) { console.log(`  ! 位置卡在 ${pos.toFixed(0)}s 超过 40 秒，放弃这条`); break; } } else same = 0;
    last = pos;
    if (i % 5 === 0) console.log(`    ${pos.toFixed(0)}/${dur.toFixed(0)}s`);
  }
  await sleep(6000);
  const after = await gapsOf();
  const still = (after.gaps || []).find((x) => x.videoId === g.videoId);
  console.log(still ? `  复验：仍缺 ${still.miss.join('、')}` : '  复验：该视频分段已全部完成 ✓');
}
const fin = await gapsOf();
console.log(`\n结束：仍有缺口的视频 ${fin.gaps.length} 条`);
for (const g of fin.gaps) console.log(`  ${g.name} 缺 ${g.miss.join('、')}`);
ws.close(); bws.close(); process.exit(0);
