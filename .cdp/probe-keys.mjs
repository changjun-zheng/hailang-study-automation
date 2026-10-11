// 窄口径提取：在已加载的 chunk 里定位若干关键调用点，只抽它们附近出现的「对象键名」标识符，
// 不返回任何源码片段/字符串内容。用来定 submitCode / createExercisesList 的真实参数契约。
//   node .cdp/probe-keys.mjs [要定位的接口名片段...]
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const NEEDLES = process.argv.slice(2);
const list = NEEDLES.length ? NEEDLES : ['submitCode', 'submitMultiCode', 'getCodeZip', 'uploadCodeZip'];

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

const PAGE = `(async()=>{
  const urls=[...new Set(performance.getEntriesByType('resource').map(e=>e.name).filter(u=>/\\.js(\\?|\$)/.test(u)))];
  const needles=${JSON.stringify(list)};
  const found={};
  for(const u of needles) found[u]={hits:0,keys:{},where:[]};
  let errs=0;
  for(const js of urls){
    let src='';
    try{ src=await (await fetch(js)).text() }catch(e){ errs++; continue }
    for(const n of needles){
      let i=src.indexOf(n);
      while(i>-1){
        found[n].hits++;
        if(found[n].where.length<3) found[n].where.push(js.split('/').pop().slice(0,44));
        const w=src.slice(Math.max(0,i-700), i+700);
        const re=/([A-Za-z_\$][A-Za-z0-9_\$]{1,28})\\s*:/g;
        let m;
        while((m=re.exec(w))){ found[n].keys[m[1]]=(found[n].keys[m[1]]||0)+1 }
        i=src.indexOf(n, i+1);
        if(found[n].hits>40) break;
      }
    }
  }
  return JSON.stringify({scanned:urls.length,errs,found})
})()`;
const o = JSON.parse(await evl(PAGE));
console.log(`扫了 ${o.scanned} 个 chunk（${o.errs} 个取不到）`);
for (const [n, v] of Object.entries(o.found)) {
  console.log(`\n【${n}】命中 ${v.hits} 次，出现在 ${v.where.join(', ') || '—'}`);
  const keys = Object.entries(v.keys).sort((a, b) => b[1] - a[1]).slice(0, 26).map(([k, c]) => `${k}${c > 1 ? '×' + c : ''}`);
  console.log('  附近出现过的对象键：' + (keys.join('  ') || '（无）'));
}
ws.close(); process.exit(0);
