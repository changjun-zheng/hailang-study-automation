// 只读：把逐条学习记录接口的字段全打出来，用"已完成的那条" vs "0 观看的那条"对照，
// 找出哪个字段才是权威完成标志。只打字段名与数值，不打个人信息。
//   node .cdp/video-status-field.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const DONE_VIDEO = '782113fb379aabfbecfd9749f1de05c8'; // 使用计算属性-2：片长 566，服务端 status=2
const INTRO_VIDEO = 'e45b2abe24e17165f326b498091b1afa'; // 课程介绍：片长 183，页面显示 0/00:03:03

const all = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && t.url.includes('study.cqie.edu.cn'));
let KEEP = null; try { KEEP = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id; } catch {}
const full = all.find((t) => t.id === KEEP) || all[0];
const ws = new WebSocket(full.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', String(r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

// 只挑与进度/状态/时长有关的键值，其余（个人信息、id 类）只列名
const expr = `(async()=>{
  const t=localStorage.getItem('token2');
  const one=async(v)=>{
    const r=await fetch('/gateway/system/orgStudent/studyVideo?studentCourseId=${SC}&videoId='+v,{headers:{Authorization:t}}).then(x=>x.json()).catch(e=>({err:String(e)}));
    const d=r.data||{};
    const rel={};
    for(const k of Object.keys(d)) if(/status|time|pos|learn|complete|duration|second|have|sum|flag/i.test(k)) rel[k]=d[k];
    return {code:r.code,allKeys:Object.keys(d).length,rel};
  };
  return JSON.stringify({done:await one('${DONE_VIDEO}'),intro:await one('${INTRO_VIDEO}')})
})()`;
const o = JSON.parse(await evl(expr));

const show = (label, x) => {
  console.log(`\n${label}: code=${x.code} 共 ${x.allKeys} 个字段`);
  for (const [k, v] of Object.entries(x.rel)) console.log(`   ${k.padEnd(20)} = ${JSON.stringify(v)}`);
};
show('对照样本（应已完成, 片长 566）', o.done);
show('课程介绍（应未完成, 片长 183）', o.intro);

const drel = o.done.rel, irel = o.intro.rel;
const diff = Object.keys({ ...drel, ...irel }).filter((k) => JSON.stringify(drel[k]) !== JSON.stringify(irel[k]));
console.log('\n两条之间取值不同的字段（权威完成判据就在这个集合里）:');
for (const k of diff) console.log(`   ${k.padEnd(20)} 完成条=${JSON.stringify(drel[k])}  未完成条=${JSON.stringify(irel[k])}`);
ws.close(); process.exit(0);
