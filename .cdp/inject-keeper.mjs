// 常驻注入器：让油猴面板在一个没装 Tampermonkey 的实例里持续存在，把指定课程按队列刷完。
// 三条设计约束（都是之前长任务踩出来的）：
//   ① 判据只读服务端权威量（progressDetails 里每条视频自己的 haveTime），不读我自己的计数；
//   ② 有锁文件，第二个实例直接退出，不跟正在跑的抢同一个页面；
//   ③ 有停车条件：刷完、会话失效、或者"剩余量长时间不降"（比如某类视频根本不计时长）都退出，
//      不烧无限预算。
//   node .cdp/inject-keeper.mjs --course 前端框架开发技术            真跑
//   node .cdp/inject-keeper.mjs --course 前端框架开发技术 --dry      只验判活与判据，不注入不点
const fs = await import('node:fs');
const path = await import('node:path');
const ROOT = path.dirname(import.meta.dirname);   // .cdp 的上一级就是仓库根（别拿正则去削反斜杠，会削不掉）
const SRC = path.join(ROOT, 'hailang-panel.user.js');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const BASE = arg('--cdp', 'http://127.0.0.1:9226');
const COURSE = arg('--course', '');
const DRY = process.argv.includes('--dry');
// keep 模式：只负责"面板一消失就补上"，不动队列、不判完成、不因为找不到标签就退出。
// 用来治「这个实例没装 Tampermonkey，一刷新面板就没了」——刷新后最多 5 秒回来。
const KEEP = process.argv.includes('--keep');
const TICK = Number(arg('--tick', KEEP ? '5' : '20')) * 1000;
const MAX_HOURS = Number(arg('--max-hours', '10'));
const STALL_MINUTES = Number(arg('--stall', '25'));
const LOCK = path.join(ROOT, '.cdp', `inject-keeper-${new URL(BASE).port}.lock`);
const toSec = (t) => String(t || '0:0:0').split(':').reduce((a, p) => a * 60 + (parseInt(p, 10) || 0), 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const L = (m) => console.log(`[${new Date().toTimeString().slice(0, 8)}] ${m}`);

// ---- 锁：已有活着的持有者就退出 ----
function alive(pid) { try { process.kill(Number(pid), 0); return true; } catch (e) { return false; } }
if (fs.existsSync(LOCK)) {
  const pid = String(fs.readFileSync(LOCK, 'utf8')).trim();
  if (pid && alive(pid)) { L(`KEEPER_ABORT 已有注入器在跑（pid ${pid}），不抢同一个页面。要重来先删 ${LOCK}`); process.exit(3); }
  L(`锁文件是残留（pid ${pid} 已不在），接管`);
}
fs.writeFileSync(LOCK, String(process.pid));
const unlock = () => { try { if (String(fs.readFileSync(LOCK, 'utf8')).trim() === String(process.pid)) fs.unlinkSync(LOCK); } catch (e) { } };
process.on('exit', unlock);

async function page() {
  // 任何 study.cqie.edu.cn 页面都要注入：面板现在在课程列表页上也会自己跳回待播条目，
  // 只认 /MyCourse/Study 的话，人一旦停在列表页就永远等不到注入（实测卡了 140 秒）
  const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('study.cqie.edu.cn'));
  if (!tabs.length) return null;
  const pick = tabs.find((t) => t.url.includes('/MyCourse/Study')) || tabs[0];
  const ws = new WebSocket(pick.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const pend = new Map();
  ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
  const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); try { ws.send(JSON.stringify({ id, method: m, params: p })); } catch (e) { pend.delete(id); rej(e); } });
  const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 120); return r.result?.value; };
  return { ws, evl, J: async (e) => JSON.parse(await evl(e)), url: tabs[0].url };
}
// 判据用**课程级** haveTime/sumTime（myCourseDetails）—— 这是平台自己认的"已学时长"，实测会随播放上涨。
// 不用每条视频自己的 haveTime：这门「前端框架开发技术」是分段关卡制，目录层的 haveTime 恒为 0，
// 拿它判会得出"41 条全没看、剩余 500 分钟"这种永远达不到的账。per-video 只当参考。
const REMAIN = (name) => `(async()=>{
  const t=localStorage.getItem('token2');if(!t)return JSON.stringify({err:'没有 token2（会话失效）'});
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const G=(p)=>fetch(p,{headers:{Authorization:t}}).then(r=>r.json()).catch(e=>({code:-1,msg:String(e)}));
  const cs=await fetch('/gateway/frequent/orgStudent/pagedMyCourse',{method:'POST',headers:{Authorization:t,'Content-Type':'application/json'},body:JSON.stringify({filters:{courseNature:null,name:'',schoolYear:'',studentId:String(me.id),term:'',courseFlag:0},pageIndex:1,pageSize:50})}).then(r=>r.json()).catch(e=>({}));
  const cl=(cs.data&&(cs.data.records||cs.data.list))||[];
  // 认课优先认当前页面 URL 里的课程 id —— 这样课程名不必从 shell 传进来（PowerShell 吃中文参数是已知坑）
  const cidHint=new URLSearchParams(location.search).get('id');
  const c=(cidHint&&cl.find(x=>x.id===cidHint))||cl.find(x=>(x.name||'').includes(${JSON.stringify(name)}));
  if(!c)return JSON.stringify({err:'没匹配到课程（URL id='+cidHint+'），可选：'+cl.map(x=>x.name).join(' / ')});
  const sid=c.studentCourseId||c.id,ver=c.version||'BK_RJGC_2024';
  const d=await G('/gateway/system/orgStudent/myCourseDetails?studentId='+(me.studyNumber||me.id)+'&id='+c.id+'&majorId='+me.majorId+'&studentCourseId='+sid+'&version='+ver);
  if(!d.data)return JSON.stringify({err:'myCourseDetails 返回 '+d.code+' '+String(d.msg||'').slice(0,40)});
  const pd=await G('/gateway/system/orgStudent/progressDetails?studentId='+(me.studyNumber||me.id)+'&id='+c.id+'&majorId='+me.majorId+'&studentCourseId='+sid+'&version='+ver);
  const vids=[];const walk=(n)=>{for(const v of (n.courseCatalogVideoVos||[]))vids.push({name:v.name,len:v.timeLength||0,have:v.haveTime});for(const k of (n.children||[]))walk(k)};
  (Array.isArray(pd.data)?pd.data:[]).forEach(walk);
  const toS=(x)=>String(x||'0:0:0').split(':').reduce((a,p)=>a*60+(parseInt(p,10)||0),0);
  const have=toS(d.data.haveTime),sum=toS(d.data.sumTime);
  const filledN=vids.filter(v=>v.len&&toS(v.haveTime)>=v.len-2).length;
  return JSON.stringify({stu:me.studyNumber||me.id,课:c.name,have:have,sum:sum,left:Math.max(0,sum-have),条数:vids.length,记满条数:filledN})
})()`;

let VER = (fs.readFileSync(SRC, 'utf8').match(/@version\s+(\S+)/) || [])[1];   // 必须 let：循环里会跟着工作区的版本走
L(`注入器启动：目标 ${BASE}，认课=当前页面 URL 里的课程 id（兜底名匹配「${COURSE || '未给'}」），面板 v${VER}${DRY ? '，dry（不注入不点）' : ''}，上限 ${MAX_HOURS} 小时，服务端已学时长 ${STALL_MINUTES} 分钟不涨就停车`);
let miss = 0, lastRemain = null, lastDropAt = Date.now(), started = KEEP, tickN = 0;
const t0 = Date.now();
while ((Date.now() - t0) / 3600000 < MAX_HOURS) {
  let p = null;
  try { p = await page(); } catch (e) { }
  if (!p) {
    miss++;
    if (!KEEP && miss > 30) { L('KEEPER_ABORT 连续 30 次找不到学习页标签（窗口被关了？），停车'); process.exit(4); }
    await sleep(5000); continue;
  }
  miss = 0;
  try {
    if (!DRY) {
      // 版本每轮重读：上一版把 VER 在启动时读死，工作区改了脚本它就不认，永远注入旧版本
      const src = fs.readFileSync(SRC, 'utf8');
      const want = (src.match(/@version\s+(\S+)/) || [])[1];
      const has = String(await p.evl('(()=>String((window.__kgPanel||{}).version||"none"))()'));
      // 正在做题时不许换版：换版会把 #kg-panel 整个删掉重建，跑了一半的那一轮就没人收尾了
      const busy = String(await p.evl('(()=>String(window.__kgPanel&&window.__kgPanel.G&&window.__kgPanel.G.answering))()'));
      if (want && has !== want && busy !== 'true') {
        await p.evl(`(()=>{window.__kgBuilt=1;window.__kgPanel=null;const e=document.getElementById('kg-panel');if(e)e.remove();return 1})()`);
        await p.evl(src + '\n;"ok"');
        VER = want;
        L(`注入面板 v${want}（上一个版本 ${has}）`);
      } else if (want && has !== want && busy === 'true') {
        L(`页面正在做题，先不打断（新版 v${want} 等下一轮）`);
      }
      if (!started) {
        const st = await p.J(`JSON.stringify((()=>{const G=window.__kgPanel&&window.__kgPanel.G;return{n:G?G.list.length:-1}})())`);
        if (st.n > 0) {
          const r = await p.evl(`(()=>{const box=document.getElementById('kg-courses');if(!box)return '没列表';
            const cid=new URLSearchParams(location.search).get('id');let hit=0;
            for(const cb of box.querySelectorAll('input')){const on=cb.dataset.id===cid;if(cb.checked!==on){cb.checked=on;cb.onchange&&cb.onchange();}if(on)hit++;}
            if(!hit)return '课程列表里没有当前这门课';
            const b=document.getElementById('kg-run');b.click();return '已只勾选当前这门课（按 URL 里的课程 id）并点开始'})()`);
          L(`起队列：${r}`);
          started = true;
        }
      }
    }
    // keep 模式不判完成也不停车，只是每 15 跳打一行心跳，证明面板还挂着
    if (KEEP && ++tickN % 15 !== 1) {
      try { p.ws.close(); } catch (e) { }
      await sleep(TICK); continue;
    }
    const s = await p.J(REMAIN(COURSE));
    if (s.err) { if (!KEEP) { L(`KEEPER_ABORT ${s.err}`); process.exit(5); } try { p.ws.close(); } catch (e) { } await sleep(TICK); continue; }
    const drop = lastRemain === null || s.left < lastRemain;
    if (drop) lastDropAt = Date.now();
    lastRemain = s.left;
    const hhmmss = (x) => [Math.floor(x / 3600), Math.floor(x / 60) % 60, x % 60].map((n) => String(n).padStart(2, '0')).join(':');
    L(`账号${s.stu}【${s.课}】服务端已学 ${hhmmss(s.have)}/${hhmmss(s.sum)}，还差 ${Math.round(s.left / 60)} 分钟；目录层记满 ${s.记满条数}/${s.条数} 条${KEEP ? '（keep：只挂面板）' : DRY ? '（dry）' : ''}`);
    if (!KEEP) {
      if (s.left <= 60) { L(`KEEPER_DONE ${s.课} 已刷完（服务端还差 ${s.left} 秒，阈值 60）`); process.exit(0); }
      if ((Date.now() - lastDropAt) / 60000 > STALL_MINUTES) {
        L(`KEEPER_STALL 服务端已学时长 ${STALL_MINUTES} 分钟没上涨，停在 ${hhmmss(s.have)}/${hhmmss(s.sum)}；目录层记满 ${s.记满条数}/${s.条数} 条`);
        L('  可能是面板没在播（窗口被关/标签被挂起）或某类视频根本不计时长 —— 别继续烧时间，交回人看');
        process.exit(6);
      }
    }
  } catch (e) { L(`  这一跳失败（页面大概正在导航）：${e.message}`); }
  try { p.ws.close(); } catch (e) { }
  await sleep(TICK);
}
L('KEEPER_DONE 到时间上限，主动停车');
process.exit(0);
