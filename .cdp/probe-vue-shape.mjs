// 判据用「成功」而不是「报错」：codeBytes>0 就说明服务端真收到了代码。
// 两条路一起试：
//   A 捷径：.vue 内容直接发给已验证可用的 codeHtmlRun/submitMultiCode 的 text 字段
//   B 正路：给 codeVueRun/submitMultiCode 发 {"<候选名>":[{fileName,content}]}，逐个看哪个被认
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const DIR = path.join(ROOT, '.cdp', 'codeq');
const vue = fs.readFileSync(path.join(DIR, fs.readdirSync(DIR).filter((f) => f.startsWith('09-'))[0]), 'utf8');
const NAMES = ['list', 'data', 'items', 'rows', 'commonList', 'modelList', 'voList', 'objects', 'records',
  'multiFileCodeQos', 'multiFileCodeQoList', 'codeQos', 'fileList', 'codeList', 'files', 'codes', 'sourceList',
  'vueFiles', 'projectList', 'mainList', 'content', 'value', 'values', 'params', 't', 'arr', 'dto'];

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.url && t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

const ARR = [{ fileName: 'App.vue', content: vue }, { fileName: 'main.js', content: "import { createApp } from 'vue'\n" }];
const out = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const vue=${JSON.stringify(vue)}; const names=${JSON.stringify(NAMES)}; const arr=${JSON.stringify(ARR)};
  const res=[];
  const a=await fetch('/gateway/code/codeHtmlRun/submitMultiCode',{method:'POST',headers:H,body:JSON.stringify({text:vue})}).then(x=>x.json()).catch(()=>({}));
  res.push({way:'A 捷径 .vue→codeHtmlRun.text',bytes:a.data&&a.data.codeBytes,lines:a.data&&a.data.codeLines,compile:a.data&&a.data.compileResult});
  for(const n of names){
    const j=await fetch('/gateway/code/codeVueRun/submitMultiCode',{method:'POST',headers:H,body:JSON.stringify({[n]:arr})}).then(x=>x.json()).catch(()=>({}));
    const d=j.data||{};
    if(Number(d.codeBytes)>0 || (d.compileResult&&String(d.compileResult)!=='null')) res.push({way:'B '+n,bytes:d.codeBytes,lines:d.codeLines,compile:String(d.compileResult).slice(0,24),text:String(d.text||'').slice(0,40)});
  }
  res.push({way:'B 探针结束（未列出的名字都没产生结果）',bytes:null});
  return JSON.stringify(res)
})()`));
console.log('判据 = codeBytes>0（服务端真收到了代码）\n');
for (const r of out) console.log(`  ${Number(r.bytes) > 0 ? '★' : '·'} ${String(r.way).padEnd(38)} codeBytes=${String(r.bytes).padStart(5)} lines=${String(r.lines).padStart(4)} compile=${r.compile || ''} ${r.text ? ' text=' + r.text : ''}`);
const wins = out.filter((r) => Number(r.bytes) > 0);
console.log(wins.length ? '\n★ 命中：' + wins.map((w) => w.way).join('；') : '\n两条路都没中');
ws.close(); process.exit(0);
