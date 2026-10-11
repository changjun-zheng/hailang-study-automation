// 探 code/codeRun/submitCode 的参数名：拿一道真实编程题的参考答案，试几种字段组合，看哪种能让服务端真的编译
// 只调用"运行"通道，不碰成绩记录
//   node .cdp/probe-submitcode.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const DIR = path.join(ROOT, '.cdp', 'codeq');
const files = fs.readdirSync(DIR).filter((f) => /\.(html|vue)$/i.test(f)).sort();
if (!files.length) { console.error('先跑 .cdp/extract-codeq.mjs 生成代码文件'); process.exit(1); }
const code = fs.readFileSync(path.join(DIR, files[0]), 'utf8');
console.log(`用 ${files[0]}（${code.length} 字节）探参数`);

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || '').slice(0, 160); return r.result?.value; };

const shapes = [
  { code },
  { content: code },
  { code, language: 'Html' },
  { code, language: 'html' },
  { code, lang: 'Html', fileName: 'index.html' },
  { code, fileName: 'index.html' },
  { codeList: [{ fileName: 'index.html', content: code }] },
  { code, questionType: 7, languageName: 'Html' },
];
const bodies = shapes.map((s) => JSON.stringify(s).slice(0, 60) + (s.code ? ' …' : ''));
const out = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const shapes=${JSON.stringify(shapes)};
  const res=[];
  for(const b of shapes){
    const r=await fetch('/gateway/code/codeRun/submitCode',{method:'POST',headers:H,body:JSON.stringify(b)}).then(x=>x.json()).catch(e=>({err:String(e)}));
    res.push({keys:Object.keys(b).join(','),uuid:r.data&&r.data.uuid?String(r.data.uuid).slice(0,10):null,status:r.data&&r.data.status,msg:r.data&&r.data.message?String(r.data.message).slice(0,90):null,code:r.code});
  }
  return JSON.stringify(res)
})()`));
console.log('\n字段组合 → 服务端反应：');
for (let i = 0; i < out.length; i++) console.log(`  [${bodies[i].slice(0, 46).padEnd(48)}] keys=${out[i].keys.padEnd(30)} status=${out[i].status} msg=${out[i].msg}`);
const good = out.find((o) => o.status !== -3 && o.msg);
if (good) console.log(`\n→ status 不再是 -3 的组合用了字段：${good.keys}`);
else console.log('\n全部 status=-3 —— 说明空/错字段都走同一条"没拿到代码"分支，参数名还没猜中');
ws.close(); process.exit(0);
