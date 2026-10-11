// 有界 chunk 爬取：从已加载的 js 里提取兄弟 chunk 文件名，抓下来只搜指定接口名附近出现的「对象键」，
// 不返回任何源码内容。用来定编程题提交载荷的真实键名。
//   node .cdp/chunk-crawl.mjs [needle1 needle2 ...]
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const NEEDLES = process.argv.slice(2).length ? process.argv.slice(2) : ['submitCode', 'runhtml', 'uploadCodeZip', 'getCodeZip', 'submitMultiCode'];
const MAX_FILES = 70;
const MAX_BYTES = 26 * 1024 * 1024;

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 220)); process.exit(1); } return r.result?.value; };

const PAGE = `(async()=>{
  const loaded=[...new Set(performance.getEntriesByType('resource').map(e=>e.name).filter(u=>/\\.js(\\?|\$)/.test(u)))];
  const dirOf=(u)=>u.slice(0,u.lastIndexOf('/')+1);
  const queue=[...loaded]; const seen=new Set(queue); const tried=[];
  const needles=${JSON.stringify(NEEDLES)};
  const hits={}; for(const n of needles) hits[n]={files:[],keys:{}};
  let bytes=0;
  while(queue.length && tried.length<${MAX_FILES} && bytes<${MAX_BYTES}){
    const u=queue.shift();
    let src='';
    try{ const r=await fetch(u); if(!r.ok) continue; src=await r.text(); }catch(e){ continue }
    tried.push({u:u.split('/').pop().slice(0,40),n:src.length}); bytes+=src.length;
    // 发现兄弟 chunk 就入队
    const re=/["']([A-Za-z0-9_\\-./]{3,60}\\.js)["']/g; let m;
    while((m=re.exec(src))){ const cand=dirOf(u)+m[1].replace(/^\\.\\//,'').replace(/^\\//,''); if(!seen.has(cand)){ seen.add(cand); queue.push(cand) } }
    for(const n of needles){
      let i=src.indexOf(n);
      while(i>-1){
        hits[n].files.push(tried[tried.length-1].u);
        const w=src.slice(Math.max(0,i-900), i+900);
        const kr=/[,{]([A-Za-z_\$][A-Za-z0-9_\$]{1,26})\\s*:/g; let k;
        while((k=kr.exec(w))) hits[n].keys[k[1]]=(hits[n].keys[k[1]]||0)+1;
        i=src.indexOf(n,i+1);
      }
    }
    if(tried.length % 15 === 0) await new Promise(r=>setTimeout(r,10));
  }
  return JSON.stringify({tried:tried.length,bytes,bytesMB:+(bytes/1048576).toFixed(1),names:tried.map(t=>t.u),hits})
})()`;
const o = JSON.parse(await evl(PAGE));
console.log(`扫了 ${o.tried} 个 chunk，共 ${o.bytesMB} MB`);
for (const [n, v] of Object.entries(o.hits)) {
  const files = [...new Set(v.files)];
  console.log(`\n【${n}】命中 ${files.length} 处${files.length ? '，位于 ' + files.slice(0, 4).join(', ') : ''}`);
  const keys = Object.entries(v.keys).sort((a, b) => b[1] - a[1]).slice(0, 34).map(([k, c]) => (c > 1 ? `${k}×${c}` : k));
  console.log('  附近对象键：' + (keys.join('  ') || '（无）'));
}
ws.close(); process.exit(0);
