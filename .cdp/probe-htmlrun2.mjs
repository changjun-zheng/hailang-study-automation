// 编程题运行接口的最后一批载荷形状。判别器 = 响应里的 codeBytes/codeLines 是否非零。
// 只打"运行"沙箱，不碰成绩。
//   node .cdp/probe-htmlrun2.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const DIR = path.join(ROOT, '.cdp', 'codeq');
const code = fs.readFileSync(path.join(DIR, fs.readdirSync(DIR).filter((f) => f.startsWith('00-'))[0]), 'utf8');

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.url && t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

// 每个条目是「要 POST 的原始 JSON 文本」，这样能测数组当 body、以及嵌套形状
const RAW = [
  [{ fileName: 'index.html', content: code }],
  { data: { fileList: [{ fileName: 'index.html', content: code }] } },
  { fileList: [{ fileName: 'index.html', content: code }], language: 'Html', exercisesId: '60ae1e9d2f0af47470cae307ada80e34' },
  { codeHtml: code },
  { htmlCode: code },
  { multiCodeList: [{ fileName: 'index.html', content: code }] },
  { codeVos: [{ fileName: 'index.html', content: code }] },
  { codeList: [{ filePath: 'index.html', fileContent: code }] },
  { fileList: [{ name: 'index.html', code }] },
  { files: [{ path: 'index.html', code }] },
];
const res = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const raw=${JSON.stringify(RAW.map((r) => JSON.stringify(r)))};
  const out=[];
  for(const body of raw){
    const j=await fetch('/gateway/code/codeHtmlRun/submitMultiCode',{method:'POST',headers:H,body}).then(x=>x.json()).catch(e=>({err:String(e)}));
    const d=(j&&j.data)||{};
    out.push({head:body.slice(0,34),len:body.length,codeLines:d.codeLines??null,codeBytes:d.codeBytes??null,
      compile:d.compileResult===undefined?null:String(d.compileResult).slice(0,24),
      text:d.text===undefined?null:String(d.text).slice(0,24),
      inner:d.data===undefined?null:(typeof d.data==='object'?'obj:'+Object.keys(d.data||{}).slice(0,6).join(','):String(d.data).slice(0,24)),
      msg:String(j.msg??d.message??'').slice(0,40)});
  }
  return JSON.stringify(out)
})()`));
console.log('POST /gateway/code/codeHtmlRun/submitMultiCode —— 判别器是 codeBytes/codeLines 是否非零\n');
for (const r of res) {
  const hit = Number(r.codeBytes) > 0 || Number(r.codeLines) > 0;
  console.log(`  ${hit ? '★' : ' '} ${String(r.head).padEnd(36)} body=${String(r.len).padStart(5)}B codeLines=${String(r.codeLines).padStart(4)} codeBytes=${String(r.codeBytes).padStart(6)} compile=${String(r.compile).padEnd(24)} text=${String(r.text).padEnd(24)} data=${String(r.inner).slice(0, 30)}`);
}
const wins = res.filter((r) => Number(r.codeBytes) > 0 || Number(r.codeLines) > 0);
console.log(wins.length ? `\n★ 命中 ${wins.length} 个形状：\n  ` + wins.map((w) => `${w.head}… -> codeBytes=${w.codeBytes} codeLines=${w.codeLines}`).join(String.fromCharCode(10, 2, 2)) : '\n全部 codeBytes=0 —— 这批也不是；载荷键只能等一次真实抓包');
ws.close(); process.exit(0);
