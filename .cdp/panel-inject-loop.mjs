// 这个实例（9226）没装 Tampermonkey，面板一遇整页导航就没了 —— 而队列流程本身就要导航。
// 所以这里挂一个"注入器"：每 3 秒看一眼学习页，没有面板就把工作区最新版注进去，
// 让面板在整段测试里持续存在；同时替我点一次「开始刷勾选的课程」，然后采样：
//   ① 有没有自己起播（不给任何可信输入）  ② 服务端 haveTime 涨不涨  ③ 片尾有没有自己跳下一条
//   node .cdp/panel-inject-loop.mjs [秒数]
import fs from 'node:fs';
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9226';
const SRC = 'D:/Workspace/Code_Projects/hailang-AutoCourse/hailang-panel.user.js';
const SECS = Number(process.argv[2] || 300);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const toSec = (t) => String(t || '0:0:0').split(':').reduce((a, p) => a * 60 + (parseInt(p, 10) || 0), 0);

async function page() {
  const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('/MyCourse/Study'));
  if (!tabs.length) return null;
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const pend = new Map();
  ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
  const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); try { ws.send(JSON.stringify({ id, method: m, params: p })); } catch (e) { pend.delete(id); rej(e); } });
  const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 120); return r.result?.value; };
  return { ws, evl, J: async (e) => JSON.parse(await evl(e)), url: tabs[0].url };
}
const VER = (fs.readFileSync(SRC, 'utf8').match(/@version\s+(\S+)/) || [])[1];
let injected = 0, started = false;
const t0 = Date.now();
let lastLine = '';
while ((Date.now() - t0) / 1000 < SECS) {
  let p = null;
  try { p = await page(); } catch (e) { }
  if (!p) { await sleep(3000); continue; }
  try {
    const has = await p.evl('(()=>String((window.__kgPanel||{}).version||"none"))()');
    if (String(has) !== VER) {
      await p.evl(`(()=>{window.__kgBuilt=1;window.__kgPanel=null;const e=document.getElementById('kg-panel');if(e)e.remove();return 1})()`);
      await p.evl(fs.readFileSync(SRC, 'utf8') + '\n;"ok"');
      injected++;
    }
    if (!started) {
      const st = await p.J(`JSON.stringify((()=>{const G=window.__kgPanel&&window.__kgPanel.G;return{n:G?G.list.length:-1,ver:(window.__kgPanel||{}).version||null}})())`);
      if (st.ver === VER && st.n > 0) {
        // 勾当前这门课并点「开始」——都是合成点击，打在面板自己的处理器上
        await p.evl(`(()=>{const box=document.getElementById('kg-courses');const cid=new URLSearchParams(location.search).get('id');
          let hit=false;for(const cb of box.querySelectorAll('input')){const want=cb.dataset.id===cid;if(cb.checked!==want){cb.checked=want;cb.onchange&&cb.onchange();}hit=hit||want;}
          return hit?'勾上了当前这门课':'课程列表里没有当前这门课'})()`);
        const msg = await p.evl(`(()=>{const b=document.getElementById('kg-run');if(!b)return '没按钮';b.click();return '已点「开始刷勾选的课程」'})()`);
        console.log(`${Math.round((Date.now() - t0) / 1000)}s ${String(msg)}（第 ${injected} 次注入，课程 ${st.n} 门）`);
        started = true;
      }
    }
    const s = await p.J(`(async()=>{const t=localStorage.getItem('token2'),me=JSON.parse(localStorage.getItem('userInfo2')||'{}'),q=new URLSearchParams(location.search);
      const v=document.querySelector('video');const G=window.__kgPanel&&window.__kgPanel.G;
      const d=await fetch('/gateway/system/orgStudent/myCourseDetails?studentId='+(me.studyNumber||me.id)+'&id='+q.get('id')+'&majorId='+me.majorId+'&studentCourseId='+q.get('studentCourseId')+'&version='+(q.get('version')||'BK_RJGC_2024'),{headers:{Authorization:t}}).then(r=>r.json()).catch(()=>({}));
      return JSON.stringify({stu:me.studyNumber||me.id,vid:q.get('videoId'),cur:v?+v.currentTime.toFixed(0):-1,dur:v?Math.round(v.duration||0):-1,paused:v?v.paused:null,
        have:(d.data&&d.data.haveTime)||'0:0:0',sum:(d.data&&d.data.sumTime)||'0:0:0',beats:G?G.beats:null,resumes:G?G.pauses||0:null,tail:G?String(G.log.slice(-1)[0]||'').slice(0,110):null})})()`);
    const line = `${Math.round((Date.now() - t0) / 1000)}s 账号${s.stu} 视频 ${String(s.vid).slice(0, 8)} 进度 ${s.cur}/${s.dur}${s.paused ? ' 停' : ' 播'} | haveTime ${s.have}/${s.sum} | 心跳 ${s.beats} 接手 ${s.resumes} | ${s.tail}`;
    if (line.replace(/^\d+s /, '') !== lastLine.replace(/^\d+s /, '')) { console.log(line); lastLine = line; }
  } catch (e) { console.log(`  （这一跳连不上，页面大概正在导航：${e.message}）`); }
  try { p.ws.close(); } catch (e) { }
  await sleep(10000);
}
console.log(`\n结束：共注入 ${injected} 次。haveTime 是否上涨、视频是否换条，看上面几行的差值。`);
process.exit(0);
