// 一条命令看清"服务端到底记了哪些视频、什么时候记的"。
//   node .cdp/records.mjs          看全部有记录的视频 + 课程总时长 + 指针
// 用来验「服务端是不是延迟批处理」：对比每条的 studyTime 和我们本地播完的时间。
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const all = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && t.url.includes('study.cqie.edu.cn'));
let KEEP = null;
try { KEEP = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id; } catch (e) { }
const SC = process.env.SC || '2c235454cef7b898bd11e77ad2b0d20c';
const CID = process.env.CID || 'e8716aab5bc18a56b115d3303f43555c';
const MID = process.env.MID || '9f07cf1e06d0a57957bd6be34efd3930';
const full = all.find((t) => t.id === KEEP) || all[0];
if (!full) {
  console.log('找不到 study 标签页（Chrome 在跑吗？）');
  process.exit(1);
}
const ws = new WebSocket(full.webSocketDebuggerUrl);
const pend = new Map();
let seq = 0;
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.id && pend.has(x.id)) {
    const p = pend.get(x.id);
    pend.delete(x.id);
    p(x.result);
  }
};
const evl = (e) =>
  new Promise((res) => {
    const id = ++seq;
    pend.set(id, res);
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: e, returnByValue: true, awaitPromise: true } }));
  }).then((r) => r.result?.value);

const out = await evl(`(async()=>{
  const A=localStorage.getItem('token2');
  if(!A) return 'token2 为空：需要重新登录';
  const H={Authorization:A};
  const p=await fetch('/gateway/system/orgStudent/myCourseDetails?studentId=YOUR_STUDENT_ID&id=${CID}&majorId=${MID}&studentCourseId=${SC}&version=BK_RJGC_2024',{headers:H}).then(r=>r.json());
  if(p.code!==200) return '读接口 code='+p.code+' msg='+p.msg+'（会话可能已被别处登录顶掉）';
  const bs=await fetch('/gateway/system/orgStudent/listCourseBarrier?courseId=${CID}&majorId=${MID}&userId=YOUR_STUDENT_ID&version=BK_RJGC_2024&studentCourseId=${SC}',{headers:H}).then(r=>r.json());
  const rows=[];
  for(const b of bs.data||[]){
    const n=await fetch('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId=${SC}',{headers:H}).then(r=>r.json());
    for(const v of (n.data||[]).filter(x=>x.videoId)){
      const s=await fetch('/gateway/system/orgStudent/studyVideo?studentCourseId=${SC}&videoId='+v.videoId+'&studentId=YOUR_STUDENT_ID&majorId=${MID}&version=BK_RJGC_2024',{headers:H}).then(r=>r.json());
      const d=s.data||{};
      if(d.studyTime) rows.push([b.name,v.catalogName,v.timeLength,d.maxCurrentPos,d.startPos+'→'+d.stopPos,d.studyTime].join(' | '));
    }
  }
  const bl=[];
  for(const b of bs.data||[]){const pr=await fetch('/gateway/system/orgStudent/barrierStudyProgress?barrierId='+b.id+'&studentCourseId=${SC}&version=BK_RJGC_2024',{headers:H}).then(r=>r.json());bl.push(b.name+' '+pr.data.haveLearned)}
  return '课程已记时长 '+p.data.haveTime+'/'+p.data.sumTime+'   各关已学: '+bl.join(' / ')+'\\n\\n关卡 | 视频 | 片长 | 已看到 | startPos→stopPos | 服务端写入时间\\n'+rows.join('\\n')
})()`);
console.log(out);
ws.close();
process.exit(0);
