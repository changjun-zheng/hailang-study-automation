// 用 Jackson 的类型不匹配报错当「字段名是否存在」的探针：
// 对候选名 X 发 {"X": []}。若 X 是 CodeQo 的真实字段且类型不是数组 → 报
//   `... CodeQo["X"]` 类型的 MismatchedInputException；若 X 不存在 → 被静默忽略，回普通响应。
// 只打运行沙箱，不碰成绩。
//   node .cdp/probe-dto.mjs [端点路径]
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const EP = process.argv[2] || '/gateway/code/codeHtmlRun/submitMultiCode';
const NAMES = ['code', 'content', 'fileList', 'codeList', 'files', 'list', 'language', 'uuid', 'fileName',
  'filePath', 'codeContent', 'html', 'name', 'sourceCode', 'codeStr', 'multiCodeList', 'codeVos',
  'codeMap', 'exercisesId', 'questionType', 'studentCourseId', 'unitId', 'videoId', 'courseId',
  'codeQoList', 'submitCodeQo', 'codeFileList', 'fileVos', 'contents', 'codes', 'text', 'htmlContent',
  'languageName', 'codeType', 'type', 'mode', 'id', 'questionId', 'examId', 'knowledgeId', 'coursewareId',
  'compile', 'runSwitch', 'autoCheck', 'checkCode', 'script', 'source', 'body', 'data', 'value', 'files2'];

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.url && t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

const out = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const names=${JSON.stringify(NAMES)}; const ep=${JSON.stringify(EP)};
  const res=[];
  for(const n of names){
    const r=await fetch(ep,{method:'POST',headers:H,body:JSON.stringify({[n]:[]})}).catch(e=>null);
    if(!r){res.push({n,err:'网络失败'});continue}
    const tx=await r.text();
    const isParse=/JSON parse error|MismatchedInputException|UnrecognizedProperty/.test(tx);
    let quoted=null;
    const m1=tx.match(/CodeQo\\["([^"]+)"\\]/); if(m1) quoted=m1[1];
    const m2=tx.match(/through reference chain:[^"]*/);
    let typeWanted=null;
    const ti=tx.indexOf('Cannot deserialize value of type ');
    if(ti>-1) typeWanted=tx.slice(ti+35, ti+90).split(' ')[0].replace(/[^A-Za-z0-9_.]/g,'');
    res.push({n,parseErr:isParse,quoted,type:typeWanted, msg:isParse?'':(tx.slice(0,160).match(/text...([^\"]{0,30})/)||[])[1]||''});
  }
  return JSON.stringify(res)
})()`));
console.log(`端点 ${EP}\n探针：{"<字段名>": []} —— parseErr=说明这个字段真的存在但类型不对\n`);
const real = [];
for (const r of out) {
  if (r.parseErr) { real.push(r.n); console.log(`  ✓ ${String(r.n).padEnd(20)} 存在（Jackson 报类型错，期望类型 ${r.type || '?'}）`); }
  else console.log(`  · ${String(r.n).padEnd(20)} 未触发解析错误  data.text=${String(r.msg).slice(0, 24)}`);
}
console.log(real.length ? `\n★ CodeQo 里确认存在的字段：${real.join(', ')}` : '\n没有一个候选名触发解析错误 —— 可能该 DTO 的字段全是 List/Object 类型（数组能正常反序列化），探针失效');
ws.close(); process.exit(0);
