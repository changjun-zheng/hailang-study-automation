// 用「塞错类型看 Jackson 是否指名报错」探 Vue 多文件运行接口的字段名。
// 判据：给候选名 X 发 {"X":{}}，若 X 是该 DTO 的 List 型字段，Jackson 会抛带 X 的类型错；
//       不存在的字段会被静默忽略（服务端没开 FAIL_ON_UNKNOWN_PROPERTIES）。
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const EP = '/gateway/code/codeVueRun/submitMultiCode';
const NAMES = ['list', 'data', 'items', 'rows', 't', 'value', 'values', 'params', 'content', 'commonList',
  'modelList', 'voList', 'dto', 'objects', 'records', 'multiFileCodeQos', 'multiFileCodeQoList', 'codeQos',
  'fileList', 'codeList', 'files', 'codes', 'main', 'mainList', 'projectList', 'vueFiles', 'sourceList',
  'text', 'language', 'fileName', 'filePath', 'uuid', 'code', 'questionType'];

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.url && t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

const PAGE = `(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const names=${JSON.stringify(NAMES)};
  const raw=await fetch('${EP}',{method:'POST',headers:H,body:'[]'}).then(x=>x.text()).catch(()=>'');
  const res=[];
  for(const n of names){
    const tx=await fetch('${EP}',{method:'POST',headers:H,body:JSON.stringify({[n]:{}})}).then(x=>x.text()).catch(()=>'');
    let fld=null;
    const qi=tx.indexOf('Qo');
    if(qi>-1){ const a=tx.indexOf('"',qi); const b=tx.indexOf('"',a+1); if(a>-1&&b>a) fld=tx.slice(a+1,b) }
    res.push({n, hit:/JSON parse error|MismatchedInput/.test(tx), fld});
  }
  return JSON.stringify({raw,res})
})()`;
const o = JSON.parse(await evl(PAGE));
console.log('数组 body 的完整报错（能看到顶层 DTO 类名）:');
console.log('  ' + String(o.raw).replace(/\s+/g, ' ').slice(0, 620));
console.log('\n字段探针：');
const found = [];
for (const r of o.res) { if (r.hit) { found.push(r.n); console.log(`  ✓ ${r.n.padEnd(20)} 触发解析错误${r.fld ? '，报出的属性名 = ' + r.fld : ''}`); } }
if (!found.length) console.log('  全部无报错 —— 这批名字里没有该 DTO 的 List 字段');
else console.log('\n★ 命中的字段：' + found.join(', '));
ws.close(); process.exit(0);
