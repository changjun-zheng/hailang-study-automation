// 跟「裸数组 body 走了不同分支」这条线索：固定外层为数组，只换数组元素的键名组合。
// 判别器 = data.text 是否从「提交代码不能为空！」变成别的值（变成别的就说明外层对了）。
// 只打运行沙箱，不碰成绩记录。
//   node .cdp/probe-array.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const DIR = path.join(ROOT, '.cdp', 'codeq');
const code = fs.readFileSync(path.join(DIR, fs.readdirSync(DIR).filter((f) => f.startsWith('00-'))[0]), 'utf8');

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.url && t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

const els = [
  { fileName: 'index.html', content: code },
  { name: 'index.html', content: code },
  { fileName: 'index.html', code },
  { name: 'index.html', code },
  { filePath: 'index.html', content: code },
  { path: 'index.html', content: code },
  { fileName: 'index.html', fileContent: code },
  { title: 'index.html', content: code },
  { fileName: 'index.html', content: code, language: 'html' },
  { fileName: 'index.html', content: code, languageName: 'Html' },
  { fileName: 'index.html', content: code, fileType: 'html' },
  { ["index.html"]: code },
];
const res = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const els=${JSON.stringify(els)};
  const out=[];
  for(const e of els){
    const body=JSON.stringify([e]);
    const j=await fetch('/gateway/code/codeHtmlRun/submitMultiCode',{method:'POST',headers:H,body}).then(x=>x.json()).catch(()=>({}));
    const d=(j&&j.data)||{};
    out.push({k:Object.keys(e).join('+'),len:body.length,text:d.text===undefined?'(无text键)':String(d.text).slice(0,44),
      lines:d.codeLines??null,bytes:d.codeBytes??null,compile:d.compileResult===undefined?null:String(d.compileResult).slice(0,20)});
  }
  // 对照：空数组、两个文件、纯字符串数组
  for(const [tag,arr] of ${JSON.stringify([['[]', []], ['两个文件', [{ fileName: 'index.html', content: code }, { fileName: 'a.js', content: 'var a=1' }]], ['字符串数组', ['x']]])}){
    const j=await fetch('/gateway/code/codeHtmlRun/submitMultiCode',{method:'POST',headers:H,body:JSON.stringify(arr)}).then(x=>x.json()).catch(()=>({}));
    const d=(j&&j.data)||{};
    out.push({k:'[对照]'+tag,text:d.text===undefined?'(无text键)':String(d.text).slice(0,44),lines:d.codeLines??null,bytes:d.codeBytes??null,compile:null});
  }
  return JSON.stringify(out)
})()`));
console.log('外层固定为数组，只换元素键名。判别器：data.text 是否还是「提交代码不能为空！」\n');
for (const r of res) {
  const moved = r.text && !/提交代码不能为空/.test(r.text);
  console.log(`  ${moved ? '★' : ' '} ${String(r.k).padEnd(42)} text=${String(r.text).padEnd(46)} codeLines=${String(r.lines).padStart(4)} codeBytes=${String(r.bytes).padStart(5)}`);
}
const moved = res.filter((r) => r.text && !/提交代码不能为空/.test(r.text));
console.log(moved.length ? '\n★ 让报错变样的元素形状：\n  ' + moved.map((m) => `${m.k} -> text=${m.text}`).join(String.fromCharCode(10, 2, 2)) : '\n全部仍是「提交代码不能为空」—— 元素键名还没中');
ws.close(); process.exit(0);
