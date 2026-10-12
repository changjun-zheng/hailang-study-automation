// 只读取证：新开一个标签页打开「课程介绍」这个单元，看平台给不给这条视频。
// 关键：绝不按播放、不 dispatch 键盘、不调 save*Plan —— 只读 DOM 与只读接口。
//   node .cdp/probe-intro-page.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const SC = '2c235454cef7b898bd11e77ad2b0d20c';
const CID = 'e8716aab5bc18a56b115d3303f43555c';
const MID = '9f07cf1e06d0a57957bd6be34efd3930';
const UNIT = '4ca322facea6bd5f080250c14990b91b';
const VIDEO = 'e45b2abe24e17165f326b498091b1afa';

const ver = await (await fetch(BASE + '/json/version')).json();
const bws = new WebSocket(ver.webSocketDebuggerUrl);
const bp = new Map(); let bid = 0;
await new Promise((r) => (bws.onopen = r));
bws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && bp.has(x.id)) { const p = bp.get(x.id); bp.delete(x.id); p(x.result); } };
const bask = (method, params) => new Promise((res) => { const id = ++bid; bp.set(id, res); bws.send(JSON.stringify({ id, method, params })); });

const { targetId } = await bask('Target.createTarget', { url: 'about:blank' });
let wsUrl = null;
for (let i = 0; i < 25 && !wsUrl; i++) {
  await new Promise((r) => setTimeout(r, 400));
  wsUrl = (await (await fetch(BASE + '/json/list')).json()).find((t) => t.id === targetId)?.webSocketDebuggerUrl;
}
const ws = new WebSocket(wsUrl);
const pend = new Map(); let seq = 0;
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'ERR ' + String(r.exceptionDetails.exception?.description || '').slice(0, 160); return r.result?.value; };

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=${CID}&studentCourseId=${SC}&version=BK_RJGC_2024&courseUnitId=${UNIT}&videoId=${VIDEO}&majorId=${MID}` });
await new Promise((r) => setTimeout(r, 15000));

console.log('落地 URL:', String(await evl('location.href')).slice(0, 150));
const vinfo = await evl(`(()=>{const v=document.querySelector('video');if(!v)return 'NO_VIDEO_ELEMENT';
  return JSON.stringify({src:String(v.currentSrc||v.src).slice(0,90),duration:v.duration,readyState:v.readyState,error:v.error?v.error.code:null,paused:v.paused,currentTime:v.currentTime})})()`);
console.log('video 元素:', vinfo);
console.log('目录里含「介绍/课程介绍」的条目:', await evl(`(()=>{const e=[...document.querySelectorAll('div,span,a,li')].map(x=>(x.textContent||'').trim()).filter(t=>t.includes('介绍')&&t.length<40);return JSON.stringify([...new Set(e)].slice(0,6))})()`));
console.log('目录条目总数（可见的 .name 行）:', await evl(`(()=>{const e=[...document.querySelectorAll('div.name')].filter(x=>x.getBoundingClientRect().height>0);return e.length+' | '+e.slice(0,4).map(x=>(x.textContent||'').trim().slice(0,18)).join(' , ')})()`));
console.log('页面提示（错误/无权限类）:', await evl(`(()=>{const m=(document.body.innerText||'').match(/[^\\n]*(无权|不存在|失败|错误|为空|没有)[^\\n]*/g)||[];return JSON.stringify([...new Set(m)].slice(0,4))})()`));

// 只读接口：这条视频的官方学习记录（studyVideo 是纯读，不写）
const rec = await evl(`(async()=>{const t=localStorage.getItem('token2');
  const r=await fetch('/gateway/study/studyRecordVideo/studyVideo?videoId=${VIDEO}&studentCourseId=${SC}',{headers:{Authorization:t}}).then(x=>x.json()).catch(e=>({err:String(e)}));
  return JSON.stringify({code:r.code,msg:String(r.msg||'').slice(0,30),data:r.data})})()`);
console.log('studyVideo 只读记录:', String(rec).slice(0, 400));

await bask('Target.closeTarget', { targetId });
ws.close(); bws.close();
console.log('\n（本探针没有点击播放、没有 dispatch 键盘、没有调用任何 save* 接口）');
process.exit(0);
