// 只读：查「课程介绍」这个节点是否可达，以及平台自己报的课程单元数/时长口径差在哪。
//   node .cdp/intro-unit.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
const INTRO_UNIT = '4ca322facea6bd5f080250c14990b91b';
const INTRO_VIDEO = 'e45b2abe24e17165f326b498091b1afa';

const all = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && t.url.includes('study.cqie.edu.cn'));
let KEEP = null; try { KEEP = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id; } catch {}
const full = all.find((t) => t.id === KEEP) || all[0];
if (!full) { console.log('找不到 study 标签页'); process.exit(1); }
const ws = new WebSocket(full.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) { console.error('EXC', String(r.exceptionDetails.exception?.description || '').slice(0, 200)); process.exit(1); } return r.result?.value; };

const fmt = (s) => { s = Number(s) || 0; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`; };

const o = JSON.parse(await evl(`(async()=>{
  const t=localStorage.getItem('token2');const H={Authorization:t,'Content-Type':'application/json'};
  const me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const G=(x)=>fetch(x,{headers:{Authorization:t}}).then(r=>r.json()).catch(e=>({err:String(e)}));
  const P=(x,b)=>fetch('/gateway/study/'+x,{method:'POST',headers:H,body:JSON.stringify(b)}).then(r=>r.json()).catch(e=>({err:String(e)}));
  const r={};
  // 1) 课程卡上的官方口径
  const cs=await G('/gateway/system/orgStudent/studentPaged?userId='+me.id+'&pageNum=1&pageSize=30');
  const c=((cs.data&&(cs.data.records||cs.data.list))||[]).find(x=>x.courseId==='${CID}'||x.id==='${CID}')||{};
  r.courseKeys=Object.keys(c).filter(k=>/time|unit|learn|process|percent|have|sum/i.test(k)).map(k=>k+'='+c[k]);
  // 2) 把「课程介绍」当 barrierId 试试子节点接口
  r.asBarrier=await G('/gateway/system/orgStudent/listCatalogBarrier?barrierId=${INTRO_UNIT}&studentCourseId=${SC}');
  // 3) 直接问这条视频的作答/学习记录（studyVideo 是纯读）
  r.video=await G('/gateway/study/studyRecordVideo/studyVideo?videoId=${INTRO_VIDEO}&studentCourseId=${SC}');
  // 4) 学习进度汇总接口
  r.plan=await P('studyRecordVideo/getStudentVideoPlan',{studentCourseId:'${SC}',videoId:'${INTRO_VIDEO}',courseId:'${CID}'});
  return JSON.stringify({course:r.courseKeys,asBarrierCode:r.asBarrier&&r.asBarrier.code,asBarrierN:(r.asBarrier&&r.asBarrier.data||[]).length,
    asBarrierRows:(r.asBarrier&&r.asBarrier.data||[]).map(n=>({n:n.catalogName,v:n.videoId,len:n.timeLength,st:n.studyVideoStatus})),
    videoCode:r.video&&r.video.code,videoData:r.video&&r.video.data,planCode:r.plan&&r.plan.code,planMsg:r.plan&&r.plan.msg,planData:r.plan&&r.plan.data})
})()`));

console.log('课程卡上与时长/单元/进度相关的字段:');
for (const k of o.courseKeys || []) console.log('   ' + k);
console.log(`\n把「课程介绍」当 barrierId 查子节点: code=${o.asBarrierCode} 返回 ${o.asBarrierN} 条`);
for (const n of o.asBarrierRows || []) console.log(`   ${n.n} videoId=${String(n.v).slice(0, 12)} 片长=${n.len} 状态=${n.st}`);
console.log(`\nstudyVideo(纯读) 对这条视频: code=${o.videoCode} data=${JSON.stringify(o.videoData).slice(0, 300)}`);
console.log(`getStudentVideoPlan: code=${o.planCode} msg=${o.planMsg} data=${JSON.stringify(o.planData).slice(0, 260)}`);
console.log(`\n参考：差值 183 秒 = ${fmt(183)}`);
ws.close(); process.exit(0);
