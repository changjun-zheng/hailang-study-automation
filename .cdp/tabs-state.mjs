// 只读诊断：现在有哪些 study 标签页、各自有没有登录态、课程列表能不能拉出来。
// 每个标签页单独 5 秒超时——被 Chrome 挂起的页面上 Runtime.evaluate 会永远不回。
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ts = await (await fetch(BASE + '/json/list')).json();
const ps = ts.filter((t) => t.type === 'page' && (t.url || '').includes('study.cqie.edu.cn'));
console.log(`study 标签页 ${ps.length} 个（另有 ${ts.filter((t) => t.type === 'page').length - ps.length} 个非 study 页面）`);

const withTimeout = (p, ms, tag) => Promise.race([p, new Promise((r) => setTimeout(() => r({ timeout: tag }), ms))]);

for (const [i, p] of ps.entries()) {
  const ws = new WebSocket(p.webSocketDebuggerUrl);
  const opened = await withTimeout(new Promise((r, j) => { ws.onopen = () => r(true); ws.onerror = () => r(false); }), 4000, 'open');
  if (!opened) { console.log(`[${i}] 连不上 WebSocket  ${p.url.slice(0, 80)}`); continue; }
  const expr = `(async()=>{
    const t=localStorage.getItem('token2');
    const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
    if(!t) return JSON.stringify({token:false,url:location.href.slice(0,70)})
    const H={Authorization:t,'Content-Type':'application/json'};
    const cs=await fetch('/gateway/frequent/orgStudent/pagedMyCourse',{method:'POST',headers:H,body:JSON.stringify({filters:{courseNature:null,name:'',schoolYear:'',studentId:String(me.id),term:'',courseFlag:0},pageIndex:1,pageSize:50})}).then(r=>r.json()).catch(e=>({code:-1,msg:String(e)}));
    const cl=(cs.data&&(cs.data.records||cs.data.list))||[];
    return JSON.stringify({token:true,url:location.href.slice(0,70),meId:String(me.id||'').slice(0,8),majorId:String(me.majorId||'').slice(0,8),listCode:cs.code,n:cl.length,names:cl.map(x=>x.name)})
  })()`;
  const r = await withTimeout(new Promise((res) => {
    ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id === 1) res(x.result); };
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
  }), 6000, 'evaluate');
  if (r && r.timeout) console.log(`[${i}] 超时（页面大概率被挂起）  ${p.url.slice(0, 80)}`);
  else console.log(`[${i}] ${JSON.stringify((r && r.value) ?? (r && r.exceptionDetails && r.exceptionDetails.text) ?? r)}`);
  ws.close();
}
process.exit(0);
