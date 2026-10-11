// 用正确的运行接口（code/codeHtmlRun/submitMultiCode）探载荷字段名。
// 之前 18 次都打在 Java 的 codeRun/submitCode 上，所以报错永远不变。
// 只调用"运行"沙箱，不碰成绩记录。
//   node .cdp/probe-htmlrun.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const DIR = path.join(ROOT, '.cdp', 'codeq');
const code = fs.readFileSync(path.join(DIR, fs.readdirSync(DIR).filter((f) => f.startsWith('00-'))[0]), 'utf8');

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 220)); process.exit(1); } return r.result?.value; };

const F = (n, c) => ({ fileName: n, content: c, filePath: n, name: n });
const shapes = [
  {},
  { fileList: [F('index.html', code)] },
  { codeList: [F('index.html', code)] },
  { files: [F('index.html', code)] },
  { list: [F('index.html', code)] },
  { codeList: [{ fileName: 'index.html', content: code }] },
  { codeList: [{ name: 'index.html', code }] },
  { html: code },
  { code },
  { content: code },
  { fileList: [{ fileName: 'index.html', fileContent: code }] },
  { fileList: [{ fileName: 'index.html', content: code }], language: 'html' },
];
const out = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const shapes=${JSON.stringify(shapes)};
  const res=[];
  for(const b of shapes){
    const j=await fetch('/gateway/code/codeHtmlRun/submitMultiCode',{method:'POST',headers:H,body:JSON.stringify(b)}).then(x=>x.json()).catch(e=>({err:String(e)}));
    const d=j.data;
    res.push({k:Object.keys(b)[0]||'(空)', n:JSON.stringify(b).length,
      lines:(d&&d.codeLines!=null)?d.codeLines:'-',bytes:(d&&d.codeBytes!=null)?d.codeBytes:'-',
      compile:(d&&d.compileResult!=null)?String(d.compileResult).slice(0,26):'-',score:(d&&d.checkScore!=null)?d.checkScore:'-',
      msg:String(j.msg??d?.message??j.err??'').slice(0,70), code:j.code});
  }
  return JSON.stringify(res)
})()`));
console.log('POST /gateway/code/codeHtmlRun/submitMultiCode 各字段组合的反应：\n');
for (const r of out) console.log(`  ${String(r.k||'(空)').padEnd(12)} body=${String(r.n).padStart(5)}B  codeLines=${String(r.lines).padStart(4)}  codeBytes=${String(r.bytes).padStart(6)}  compile=${String(r.compile).padEnd(26)} score=${r.score}  msg=${r.msg}`);
const ok = out.filter((r) => Number(r.bytes) > 0);
console.log(ok.length ? '\n★ 报错变了的组合：\n  ' + ok.map((c) => `${c.k} -> code=${c.code} ${c.msg} / data=${c.keys}`).join(String.fromCharCode(10, 2, 2)) : '\n仍然全部「不能为空」—— 需要换一批字段名');
ws.close(); process.exit(0);
