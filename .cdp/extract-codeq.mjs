// 只读 + 本地写文件：把编程题的 referenceAnswer（被语法高亮 span 包着的 HTML）还原成纯代码
//   node .cdp/extract-codeq.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const DIR = path.join(ROOT, '.cdp', 'codeq');
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
fs.mkdirSync(DIR, { recursive: true });

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

const PAGE = `(async()=>{
  const tok=localStorage.getItem('token2');const H={Authorization:tok,'Content-Type':'application/json'};
  const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(()=>({}));
  const G=(x)=>fetch(x,{headers:H}).then(r=>r.json()).catch(()=>({}));
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const bs=await G('/gateway/system/orgStudent/listCourseBarrier?courseId=${CID}&majorId=${MID}&userId='+me.id+'&version=BK_RJGC_2024&studentCourseId=${SC}');
  const units=[];
  for(const b of bs.data||[]){const ns=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId=${SC}');
    for(const n of ns.data||[]) if(n.videoId&&!units.some(x=>x.unitId===n.id)) units.push({unitId:n.id,name:n.catalogName,videoId:n.videoId})}
  const out=[];
  for(const s of units){
    await P('studyRecordExercises/exerciseBarrier',{studentCourseId:'${SC}',unitId:s.unitId});
    const l=await P('studyRecordExercises/exercisesList',{studentCourseId:'${SC}',courseId:'${CID}',majorId:'${MID}',unitId:s.unitId,version:'BK_RJGC_2024'});
    for(const q of (l.data||[])) if(q.questionType===7) out.push({unit:s.name,unitId:s.unitId,videoId:s.videoId,qid:q.id,lang:q.languageName,
      content:q.content,ref:q.referenceAnswer,submitted:q.submitAnswer,base:q.baseFileName,baseFileUrl:q.baseFileUrl});
    await P('studyRecordExercises/clearStudentUnit',{studentCourseId:'${SC}',unitId:s.unitId});
  }
  return JSON.stringify(out)
})()`;
const list = JSON.parse(await evl(PAGE));

// 语法高亮 HTML -> 纯代码：块级标签转换行、去掉所有标签、解实体
function toCode(html) {
  let t = String(html || '');
  t = t.replace(/<\s*(br|\/p|\/div|\/li|\/pre)\s*\/?\s*>/gi, String.fromCharCode(10));
  t = t.replace(/<[^>]+>/g, '');
  t = t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  t = t.replace(/\u00a0/g, ' ');
  t = t.replace(/(?:\r?\n){3,}/g, String.fromCharCode(10, 10));
  return t.replace(/[ \t]+$/gm, '').trim();
}
const plain = (h) => toCode(h);

console.log(`${list.length} 道编程题：`);
for (let i = 0; i < list.length; i++) {
  const q = list[i];
  const code = toCode(q.ref);
  const ext = /vue/i.test(q.lang || '') ? 'vue' : 'html';
  const file = path.join(DIR, String(i).padStart(2, '0') + '-' + (q.unit || '').replace(/[\\/:*?"<>|]/g, '_') + '.' + ext);
  fs.writeFileSync(file, code, 'utf8');
  // 平台的 referenceAnswer 有时不是代码而是一句中文说明（如「具体内容请见学习视频和讲义」），
  // 这种内容被当 HTML 也能「编译成功」，必须在这里就判掉，否则下游会虚报通过率
  const tags = (code.match(/<(html|head|body|div|script|template|style)[\s>]/gi) || []).length;
  const looksLikeCode = tags >= 2 && code.length > 120;
  console.log(`  [${i}] ${String(q.unit).slice(0, 24).padEnd(26)} ${q.lang} ${String(code.length).padStart(5)} 字节 ${looksLikeCode ? '✓ 真代码' : '✗ 不是代码（平台只给了说明文字，需另写）'} 已答=${q.submitted || '无'}`);
  console.log(`      题干: ${plain(q.content).slice(0, 70)}`);
  console.log(`      首行: ${code.split(String.fromCharCode(10))[0].slice(0, 76)}`);
  if (!looksLikeCode) console.log(`      !!! 内容预览: ${code.slice(0, 160)}`);
}
console.log(`\n全部还原到 ${DIR}/`);
ws.close(); process.exit(0);
