// 回读某条视频的监控记录 + 课程已记时长。
//   node .cdp/check-one.mjs 使用指令进行条件渲染-1
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const KEEP = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id;
const NAME = process.argv[2] || '使用指令进行条件渲染-1';
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';

const full = (await (await fetch(BASE + '/json/list')).json()).find((t) => t.id === KEEP && t.type === 'page');
if (!full) {
  console.log('找不到标签页');
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
    x.error ? p.rej(new Error(x.error.message)) : p.res(x.result);
  }
};
const evl = async (e) => {
  const r = await new Promise((res, rej) => {
    const id = ++seq;
    pend.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: e, returnByValue: true, awaitPromise: true } }));
  });
  return r.result?.value;
};
const api = (u) => `fetch(${JSON.stringify(u)}, {headers:{Authorization: localStorage.getItem('token2')}}).then(r=>r.json())`;

const out = await evl(`(async()=>{
  const A=localStorage.getItem('token2');
  const bs=await fetch('/gateway/system/orgStudent/listCourseBarrier?courseId=${CID}&majorId=${MID}&userId=YOUR_STUDENT_ID&version=BK_RJGC_2024&studentCourseId=${SC}',{headers:{Authorization:A}}).then(r=>r.json());
  let hit=null;
  for(const b of bs.data||[]){
    const n=await fetch('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId=${SC}',{headers:{Authorization:A}}).then(r=>r.json());
    const v=(n.data||[]).find(x=>x.catalogName===${JSON.stringify(NAME)});
    if(v){hit={videoId:v.videoId,status:v.studyVideoStatus};break}
  }
  if(!hit)return '目录里找不到这条视频';
  const s=await fetch('/gateway/system/orgStudent/studyVideo?studentCourseId=${SC}&videoId='+hit.videoId+'&studentId=YOUR_STUDENT_ID&majorId=${MID}&version=BK_RJGC_2024',{headers:{Authorization:A}}).then(r=>r.json());
  const d=s.data||{};
  const p=await fetch('/gateway/system/orgStudent/myCourseDetails?studentId=YOUR_STUDENT_ID&id=${CID}&majorId=${MID}&studentCourseId=${SC}&version=BK_RJGC_2024',{headers:{Authorization:A}}).then(r=>r.json());
  const pr=await fetch('/gateway/system/orgStudent/barrierStudyProgress?barrierId='+(bs.data[0].id)+'&studentCourseId=${SC}&version=BK_RJGC_2024',{headers:{Authorization:A}}).then(r=>r.json());
  return ${JSON.stringify(NAME)}+' 状态='+hit.status+' 记录: studyTime='+d.studyTime+' startPos='+d.startPos+' stopPos='+d.stopPos+' maxCurrentPos='+d.maxCurrentPos+'\\n课程已记时长='+p.data.haveTime+'  第一关已学='+pr.data.haveLearned+'/17'
})()`);
console.log(out);
ws.close();
process.exit(0);
