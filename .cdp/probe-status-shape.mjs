// 只读：确认权威枚举接口 progressDetails 的结构，以及逐条状态该怎么读。
// 带对照样本：一条服务端已记为完成(status=2)的视频 vs「课程介绍」这条 0 观看的。
//   node .cdp/probe-status-shape.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const INTRO_VIDEO = 'e45b2abe24e17165f326b498091b1afa';
const DONE_VIDEO = '782113fb379aabfbecfd9749f1de05c8'; // 使用计算属性-2，服务端 status=2

const all = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && t.url.includes('study.cqie.edu.cn'));
let KEEP = null; try { KEEP = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id; } catch {}
const full = all.find((t) => t.id === KEEP) || all[0];
const ws = new WebSocket(full.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', String(r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

const o = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const G=(x)=>fetch(x,{headers:{Authorization:t}}).then(r=>r.json()).catch(e=>({err:String(e)}));
  const r={};
  r.meIdKeys=Object.keys(me).filter(k=>/id|number|code|studentNo/i.test(k));
  r.meStudentId=me.studentId||me.studentNo||me.loginName||null;
  const pd=await G('/gateway/system/orgStudent/progressDetails?studentId='+(me.studentId||me.studentNo||'')+'&id=${CID}&majorId='+me.majorId);
  r.pdCode=pd.code; r.pdMsg=String(pd.msg||'').slice(0,30);
  const top=Array.isArray(pd.data)?pd.data:[];
  r.pdTopNames=top.map(n=>n.name+'(children='+(n.children||[]).length+',vids='+(n.courseCatalogVideoVos||[]).length+')');
  // 递归数视频：每条在 courseCatalogVideoVos[] 里，其 unitId 指向所属目录节点
  let vids=[];
  const walk=(n,parent)=>{ for(const v of (n.courseCatalogVideoVos||[])) vids.push({videoId:v.id,unitId:v.unitId||n.id,name:v.name,len:v.timeLength});
    for(const c of (n.children||[])) walk(c,n); };
  top.forEach(n=>walk(n,null));
  r.total=vids.length;
  r.sample=vids.slice(0,3);
  r.introFound=vids.find(v=>v.videoId==='${INTRO_VIDEO}')||null;
  const s1=await G('/gateway/system/orgStudent/studyVideo?studentCourseId=${SC}&videoId=${INTRO_VIDEO}');
  const s2=await G('/gateway/system/orgStudent/studyVideo?studentCourseId=${SC}&videoId=${DONE_VIDEO}');
  r.introStatus={code:s1.code,keys:Object.keys(s1.data||{}).slice(0,10),status:(s1.data||{}).studyVideoStatus,have:(s1.data||{}).haveTime};
  r.doneStatus={code:s2.code,status:(s2.data||{}).studyVideoStatus,have:(s2.data||{}).haveTime};
  return JSON.stringify(r)
})()`));

console.log('userInfo2 里 id 类键名（不打印值）:', o.meIdKeys.join(', '), '| studentId 取到:', o.meStudentId ? '有' : '无');
console.log(`\nprogressDetails: code=${o.pdCode} msg=${o.pdMsg}`);
console.log('顶层节点:', (o.pdTopNames || []).join(' | '));
console.log(`递归数到的视频总数 = ${o.total}`);
for (const v of o.sample || []) console.log(`   样例 ${String(v.name).slice(0, 26)} videoId=${v.videoId.slice(0, 10)} unitId=${v.unitId.slice(0, 10)} 片长=${v.len}`);
console.log('\n「课程介绍」在树里的条目:', JSON.stringify(o.introFound));
console.log(`\n逐条状态接口 orgStudent/studyVideo:`);
console.log('   课程介绍 (应未完成):', JSON.stringify(o.introStatus));
console.log('   对照样本 使用计算属性-2 (应 status=2):', JSON.stringify(o.doneStatus));
ws.close(); process.exit(0);
