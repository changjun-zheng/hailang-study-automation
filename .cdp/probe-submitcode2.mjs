// 只探"运行"通道（不碰成绩记录）：批量试 submitCode 的字段名，看哪能让服务端的报错变样
//   node .cdp/probe-submitcode2.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const code = fs.readFileSync(path.join(ROOT, '.cdp', 'codeq', fs.readdirSync(path.join(ROOT, '.cdp', 'codeq')).filter((f) => f.startsWith('00-'))[0]), 'utf8');

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

const NAMES = ['codeContent', 'sourceCode', 'submitCode', 'answer', 'answerContent', 'codeStr', 'fileContent', 'content', 'text', 'value', 'codes', 'codeVos', 'studyCode', 'codeList'];
const shapes = NAMES.map((n) => (n === 'codeList' ? { codeList: [{ fileName: 'index.html', content: code }] } : { [n]: code }));
const out = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const shapes=${JSON.stringify(shapes)};const code=${JSON.stringify(code)};
  const res=[];
  for(const b of shapes){
    const j=await fetch('/gateway/code/codeRun/submitCode',{method:'POST',headers:H,body:JSON.stringify(b)}).then(x=>x.json()).catch(e=>({err:String(e)}));
    res.push({k:Object.keys(b)[0],status:j.data&&j.data.status,msg:j.data?String(j.data.message||'').slice(0,60):String(j.msg||j.err||'').slice(0,60)});
  }
  const extra=[];
  for(const b of [{code,language:'html'},{code,language:'Html',uuid:'x'},{code,language:'HTML',fileName:'index.html'},{code,language:'html',questionType:7}]){
    const j=await fetch('/gateway/code/codeRun/submitCode',{method:'POST',headers:H,body:JSON.stringify(b)}).then(x=>x.json()).catch(()=>({}));
    extra.push({k:Object.keys(b).join('+'),status:j.data&&j.data.status,msg:j.data?String(j.data.message||'').slice(0,60):''});
  }
  return JSON.stringify({res,extra})
})()`));
console.log('单字段尝试：');
for (const r of out.res) console.log(`  ${String(r.k).padEnd(16)} status=${r.status} msg=${r.msg}`);
console.log('\n带 language 的组合：');
for (const r of out.extra) console.log(`  ${String(r.k).padEnd(34)} status=${r.status} msg=${r.msg}`);
const changed = [...out.res, ...out.extra].filter((r) => r.msg && !/提交代码不能为空/.test(r.msg));
console.log(changed.length ? '\n★ 报错变了的组合：\n  ' + changed.map((c) => `${c.k} -> ${c.msg}`).join(String.fromCharCode(10, 2, 2)) : '\n全部仍是「提交代码不能为空」—— 字段名没在这批里');
ws.close(); process.exit(0);
