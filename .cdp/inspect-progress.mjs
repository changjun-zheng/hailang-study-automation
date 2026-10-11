// 只读：把某个关卡的 barrierStudyProgress 原样结构摊开，看服务端到底按什么字段记视频完成。
//   node .cdp/inspect-progress.mjs [--course 前端框架开发技术]
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const COURSE = arg('--course', '前端框架开发技术');
const runnerId = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id;
let t = null;
for (let i = 0; i < 10 && !t; i++) {
  t = (await (await fetch(BASE + '/json/list')).json()).find((x) => x.id === runnerId && x.type === 'page');
  if (!t) await sleep(500);
}
const ws = new WebSocket(t.webSocketDebuggerUrl);
const pend = new Map();
let seq = 0;
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(new Error('ws 失败'));
  ws.onmessage = (m) => {
    const x = JSON.parse(m.data);
    if (x.id && pend.has(x.id)) {
      const p = pend.get(x.id);
      pend.delete(x.id);
      x.error ? p.rej(new Error(x.error.message)) : p.res(x.result);
    }
  };
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pend.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evl = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'eval 异常').slice(0, 200));
  return r.result?.value;
};
const get = async (url) => JSON.parse(await evl(`fetch(${JSON.stringify(url)}, {headers:{Authorization: localStorage.getItem('token2')}}).then(r=>r.text())`));
const post = async (url, body) => JSON.parse(await evl(`fetch(${JSON.stringify(url)}, {method:'POST',headers:{'Content-Type':'application/json',Authorization: localStorage.getItem('token2')},body: ${JSON.stringify(JSON.stringify(body))}}).then(r=>r.text())`));

const prof = JSON.parse(await evl(`JSON.stringify((()=>{const u=JSON.parse(localStorage.getItem('userInfo2')||'{}');return {id:u.id||'',majorId:u.majorId||''}})())`));
const studentId = prof.id;
const courses = await post('/gateway/frequent/orgStudent/pagedMyCourse', { filters: { courseNature: null, name: '', schoolYear: '', studentId, term: '', courseFlag: 0 }, pageIndex: 1, pageSize: 50 });
const list = (courses.data?.records || courses.data?.list || []).filter((c) => (c.name || c.courseName || '').includes(COURSE.slice(0, 4)));
if (!list.length) {
  console.error('没这门课');
  process.exit(1);
}
const c = list[0];
const sid = c.studentCourseId || c.id;
console.log(`课程=${c.name || c.courseName} studentCourseId=${sid} version=${c.version} studentId(来自JWT)=${studentId}`);
const bs = (await get(`/gateway/system/orgStudent/listCourseBarrier?courseId=${c.id}&majorId=${c.majorId || ''}&userId=${studentId}&version=${c.version}&studentCourseId=${sid}`)).data || [];
const b = bs[0];
const prog = await get(`/gateway/system/orgStudent/barrierStudyProgress?barrierId=${b.id}&studentCourseId=${sid}&version=${c.version}`);
console.log(`\n关卡「${b.name}」barrierStudyProgress 顶层字段：`, Object.keys(prog.data || {}).join(', '));
console.log(JSON.stringify(prog.data, null, 1).slice(0, 1200));
const nodes = (await get(`/gateway/system/orgStudent/listCatalogBarrier?barrierId=${b.id}&studentCourseId=${sid}`)).data || [];
const vids = nodes.filter((n) => n.videoId);
console.log(`\n关卡「${b.name}」listCatalogBarrier 共 ${nodes.length} 节点，其中带 videoId 的 ${vids.length} 条`);
console.log('单条节点全部字段：', JSON.stringify(vids[0] || {}, null, 1).slice(0, 900));
console.log('\n逐条视频的"已学"相关字段：');
for (const n of vids) {
  const f = Object.entries(n)
    .filter(([k]) => /learn|status|time|rate|progress|complete|flag|watch|study/i.test(k))
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(' ');
  console.log(`  ${(n.name || n.unitName || '?').padEnd(30)} ${f}`);
}
ws.close();
process.exit(0);
