// 直接试 CodeQo 已确认存在的 text 字段：把还原出来的答案代码当 text 发过去
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
const out = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const code=${JSON.stringify(code)};
  const cases=[{text:code},{text:code,language:'html'},{text:code,languageName:'Html'},{text:'<html><body>1</body></html>'}];
  const res=[];
  for(const b of cases){
    const j=await fetch('/gateway/code/codeHtmlRun/submitMultiCode',{method:'POST',headers:H,body:JSON.stringify(b)}).then(x=>x.json()).catch(()=>({}));
    const d=j.data||{};
    res.push({k:Object.keys(b).join('+'),len:JSON.stringify(b).length,text:String(d.text??'(null)').slice(0,70),
      lines:d.codeLines??null,bytes:d.codeBytes??null,compile:String(d.compileResult??'(null)').slice(0,40),
      check:String(d.checkResult??'(null)').slice(0,30),score:d.checkScore??null});
  }
  return JSON.stringify(res)
})()`));
console.log('用已确认存在的 text 字段发真代码：\n');
for (const r of out) console.log(`  ${String(r.k).padEnd(26)} body=${String(r.len).padStart(4)}B  codeLines=${String(r.lines).padStart(4)} codeBytes=${String(r.bytes).padStart(5)}\n     text=${r.text}\n     compile=${r.compile}  check=${r.check} score=${r.score}`);
const hit = out.filter((r) => Number(r.bytes) > 0 || Number(r.lines) > 0);
console.log(hit.length ? '\n★ 服务端收到代码了 —— text 就是那个字段' : '\ntext 也没被当成代码 —— 需要继续找 CodeQo 的其它字段');
ws.close(); process.exit(0);
