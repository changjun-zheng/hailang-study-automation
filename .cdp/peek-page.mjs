// 只读地看一眼目标实例的学习页现在是什么状态：面板版本、在哪个页、有没有视频、按钮写的什么、队列走到第几条。
// 用来回答"到底有没有在刷"这类问题，不改任何东西。
//   node .cdp/peek-page.mjs [http://127.0.0.1:9226]
const BASE = process.argv[2] || process.env.CDP_BASE || 'http://127.0.0.1:9226';
const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('study.cqie.edu.cn'));
if (!tabs.length) { console.log('这个实例里没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 140); return r.result?.value; };
const o = JSON.parse(await evl(`JSON.stringify((()=>{const v=document.querySelector('video'),G=window.__kgPanel&&window.__kgPanel.G;
  let job=null;try{job=JSON.parse(localStorage.getItem('kg-job')||'null')}catch(e){}
  const vid=new URLSearchParams(location.search).get('videoId');
  const idx=job&&Array.isArray(job.todo)?job.todo.findIndex(x=>x.id===vid):-1;
  return{路径:location.pathname.replace('/stu/pages/',''),标题:document.title.slice(0,20),
  面板:(window.__kgPanel||{}).version||'没注入',有视频:!!v,
  播放:v?(!v.paused?'在播':'停着'):'-',进度:v?Math.round(v.currentTime)+'/'+Math.round(v.duration||0)+'s':'-',
  倍速:v?v.playbackRate:'-',声音:v?(v.muted?'静音':('音量'+v.volume)):'-',
  按钮:(document.getElementById('kg-run')||{}).textContent||'-',
  队列:job?('第 '+(job.i+1)+'/'+job.queue.length+' 门，本门第 '+(idx+1)+'/'+job.todo.length+' 条'):'无任务',
  计数:G?('心跳'+G.beats+' 接手'+(G.pauses||0)+' 暂停事件'+(G.pauseSeen||0)+' 迟到'+Math.round(G.late||0)+'ms'):'-',
  日志尾:String((G&&(G.log.slice(-1)[0]||''))||'').slice(0,90)}})())`));
for (const [k, val] of Object.entries(o)) console.log(`  ${k}：${val}`);
ws.close(); process.exit(0);
