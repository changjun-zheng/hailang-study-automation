// 把 headless 的 UA 换成普通 Chrome，播一条没记上账的视频，看站点会不会开始写 saveStudyVideoPlan
//   node .cdp/ua-test.mjs [观察秒数]
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const SECS = Number(process.argv[2] || 240);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';
const U = 'https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=e8716aab5bc18a56b115d3303f43555c&studentCourseId=2c235454cef7b898bd11e77ad2b0d20c&version=BK_RJGC_2024&courseUnitId=26faae1858fb8cfa8887ee390de5dacf&videoId=00158ffad1259ab4861197aa3420a511&majorId=9f07cf1e06d0a57957bd6be34efd3930';

const ps = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = ps.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map(); const hits = [];
ws.onmessage = (e) => {
  const x = JSON.parse(e.data);
  if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); return; }
  if (x.method === 'Network.requestWillBeSent') {
    const q = x.params.request; const u = decodeURIComponent(q.url);
    if (/StudyVideoPlan|studyRecordVideoMonitor|saveStudyVideo/i.test(u)) hits.push(`${new Date().toTimeString().slice(0, 8)} ${q.method} ${u.replace('https://study.cqie.edu.cn', '').slice(0, 100)}${q.postData ? '  BODY=' + q.postData.slice(0, 400) : ''}`);
  }
};
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC:' + (r.exceptionDetails.exception?.description || '').slice(0, 160); return r.result?.value; };
await send('Network.enable'); await send('Page.enable'); await send('Runtime.enable');
await send('Network.setUserAgentOverride', { userAgent: UA, acceptLanguage: 'zh-CN,zh;q=0.9', platform: 'Win32' });
await send('Page.navigate', { url: U });
await new Promise((r) => setTimeout(r, 16000));
console.log('UA 现在:', await evl('navigator.userAgent'));
await evl(`(()=>{const v=document.querySelector('video');if(v){v.muted=true;v.play().catch(()=>{})}})()`);
console.log(`开始观察 ${SECS} 秒（目标：使用计算属性-1，887 秒，服务端目前 0 记录）`);
for (let i = 1; i <= SECS / 40; i++) {
  await new Promise((r) => setTimeout(r, 40000));
  const s = JSON.parse((await evl(`(()=>{const v=document.querySelector('video');return JSON.stringify({t:v?Math.round(v.currentTime):null,d:v?Math.round(v.duration):null,p:v?v.paused:null})})()`)) || '{}');
  console.log(`  +${i * 40}s t=${s.t}/${s.d} paused=${s.p} 命中写请求 ${hits.length} 条`);
  if (s.p) await evl(`(()=>{const v=document.querySelector('video');v.play().catch(()=>{})})()`);
}
console.log('\n命中的写请求：');
for (const h of hits.slice(0, 10)) console.log('  ' + h);
if (!hits.length) console.log('  （一条都没有 —— UA 不是闸门，得换别的判据）');
ws.close(); process.exit(0);
