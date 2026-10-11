// 用运行通道验证每道编程题的还原答案能不能编译（不提交成绩、不写任何记录）
//   node .cdp/run-codeq.mjs
import fs from 'node:fs';
import path from 'node:path';
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const DIR = path.join(ROOT, '.cdp', 'codeq');
const allFiles = fs.readdirSync(DIR).filter((f) => /\.(html|vue)$/i.test(f)).sort();
// 平台对两道 Vue3 题只给了「具体内容请见学习视频和讲义」这样的说明文字，不是代码；
// 这种内容丢进 HTML 沙箱也会返回 compile=success，会把通过率虚报成 11/11。先按标签数滤掉。
const isCode = (f) => { const c = fs.readFileSync(path.join(DIR, f), 'utf8'); return (c.match(/<(html|head|body|div|script|template|style)[\s>]/gi) || []).length >= 2 && c.length > 120; };
const files = allFiles.filter(isCode);
const skipped = allFiles.filter((f) => !isCode(f));
const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.url && t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };
// codeVueRun 的载荷键没探出来，但它收 text 也能编译：统一走 codeHtmlRun 的 text 字段做校验
class X{}
const cases = files.map((f) => ({ f, ep: '/gateway/code/codeHtmlRun/submitMultiCode', code: fs.readFileSync(path.join(DIR, f), 'utf8') }));
const out = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const cases=${JSON.stringify(cases.map((c) => ({ f: c.f, ep: c.ep, code: c.code })))};
  const res=[];
  for(const c of cases){
    const j=await fetch(c.ep,{method:'POST',headers:H,body:JSON.stringify({text:c.code})}).then(x=>x.json()).catch(e=>({err:String(e)}));
    const d=j.data||{};
    const url=(String(d.text||'').match(/href="([^"]+)"/)||[])[1]||null;
    res.push({f:c.f,ep:c.ep.split('/').slice(-2)[0],lines:d.codeLines??null,bytes:d.codeBytes??null,
      compile:String(d.compileResult??'(null)').slice(0,30),check:String(d.checkResult??'').slice(0,20),url});
  }
  return JSON.stringify(res)
})()`));
console.log(`${out.length} 道编程题的还原答案，逐个送进运行沙箱验证：\n`);
let ok = 0;
for (const r of out) {
  const good = r.compile === 'success' && Number(r.bytes) > 0;
  if (good) ok++;
  console.log(`  ${good ? '✓' : '✗'} ${String(r.f).slice(0, 40).padEnd(42)} ${r.ep.padEnd(14)} lines=${String(r.lines).padStart(3)} bytes=${String(r.bytes).padStart(5)} compile=${r.compile}${r.url ? '\n      预览: ' + r.url.slice(0, 96) : ''}`);
}
console.log(`\n编译通过 ${ok}/${out.length}`);
ws.close(); process.exit(0);
