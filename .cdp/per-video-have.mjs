// 三次量到 haveTime +0，我不再换视频硬试了 —— 直接把这两条视频自己的字段摊开看：
// 如果它们各自的"已记时长"已经等于时长，那 +0 是样本记满，不是面板没记账。
//   node .cdp/per-video-have.mjs
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9225';
const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('/MyCourse/Study'));
if (!tabs.length) { console.error('没有学习页'); process.exit(1); }
const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'EXC ' + String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 160); return r.result?.value; };
const out = await evl(`(async()=>{
  const t=localStorage.getItem('token2'),me=JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const G=(p)=>fetch(p,{headers:{Authorization:t}}).then(r=>r.json());
  const q=new URLSearchParams(location.search);
  const cid=q.get('id'),sid=q.get('studentCourseId'),ver=q.get('version')||'BK_RJGC_2024';
  const pd=await G('/gateway/system/orgStudent/progressDetails?studentId='+(me.studyNumber||me.id)+'&id='+cid+'&majorId='+me.majorId+'&studentCourseId='+sid+'&version='+ver);
  const rows=[];const walk=(n)=>{for(const v of (n.courseCatalogVideoVos||[]))rows.push({unit:n.name,...v});for(const k of (n.children||[]))walk(k)};
  (Array.isArray(pd.data)?pd.data:[]).forEach(walk);
  const pick=rows.filter(r=>/批量删除|路由守卫|商品数据/.test(r.name||'')).map(r=>({名:r.name,时长:r.timeLength,字段:Object.keys(r).filter(k=>/time|Time|status|Status|have|Have|study|progress/i.test(k)).map(k=>k+'='+r[k]).join(', ')}));
  const d=await G('/gateway/system/orgStudent/myCourseDetails?studentId='+(me.studyNumber||me.id)+'&id='+cid+'&majorId='+me.majorId+'&studentCourseId='+sid+'&version='+ver);
  return JSON.stringify({课程:(d.data&&(d.data.name||d.data.courseName))||'?',have:d.data&&d.data.haveTime,sum:d.data&&d.data.sumTime,条数:rows.length,pick})})()`);
const o = JSON.parse(out);
console.log(`【${o.课程}】服务端 haveTime ${o.have} / sumTime ${o.sum}，progressDetails 里 ${o.条数} 条视频`);
for (const p of o.pick) console.log(`  「${p.名}」 时长 ${p.时长}s\n    ${p.字段}`);
ws.close(); process.exit(0);
