// 从 api 模块里把「方法名 -> 接口路径」这一层映射抽出来（只取路径字符串，不返回源码）
//   node .cdp/api-paths.mjs [方法名...]
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const NAMES = process.argv.slice(2).length ? process.argv.slice(2) : [
  'runhtml', 'runvue3', 'runvue2', 'runjava', 'runsql', 'runpython', 'getCStatus', 'getJavaStatus',
  'uploadCodeZip', 'getCodeZip', 'studyRecordExercisesremove', 'saveExamAnswer', 'submitExamAnswer',
  'sendVideoData', 'upload', 'checkStudyRecordExercises', 'exercisesList', 'recordExercisesCreateList',
];
const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', (r.exceptionDetails.exception?.description || '').slice(0, 220)); process.exit(1); } return r.result?.value; };

const PAGE = `(async()=>{
  const urls=[...new Set(performance.getEntriesByType('resource').map(e=>e.name).filter(u=>/\\.js(\\?|\$)/.test(u)))];
  const names=${JSON.stringify(NAMES)};
  const out={};
  for(const js of urls){
    let src=''; try{ src=await (await fetch(js)).text() }catch(e){ continue }
    if(src.indexOf('submitCode')<0 && src.indexOf('runhtml')<0) continue;
    for(const n of names){
      // 只认 "name":...  或  name:function 这种定义点，避免命中调用处
      const re=new RegExp('["\\']?'+n+'["\\']?\\\\s*[:=]\\\\s*(?:function\\\\s*\\\\([^)]*\\\\)\\\\{)?\\\\s*[^;]{0,220}');
      const m=re.exec(src);
      if(!m || out[n]) continue;
      const w=m[0];
      const pm=w.match(/["'\`]((?:\\/gateway)?[A-Za-z0-9_\\-./{}?=&]{4,120}?)["'\`]/);
      out[n]={file:js.split('/').pop().slice(0,34), path: pm?pm[1]:null, ctx: pm? null : w.slice(0,150).replace(/[^ -~]/g,'.')};
    }
  }
  return JSON.stringify(out)
})()`;
const o = JSON.parse(await evl(PAGE));
console.log('方法名 → 接口路径：');
for (const [n, v] of Object.entries(o)) {
  console.log(`  ${String(n).padEnd(26)} ${v.path ? '= ' + v.path : '（没抽到路径）' + (v.ctx ? ' 片段: ' + v.ctx.slice(0, 110) : '')}`);
}
const missing = NAMES.filter((n) => !o[n]);
if (missing.length) console.log('\n没找到的方法名：' + missing.join(', '));
ws.close(); process.exit(0);
