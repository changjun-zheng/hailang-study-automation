// 检查可见窗口的登录态，并把某个单元的视频深链拼出来（只读，不写任何数据）
//   node .cdp/login-check.mjs [课程名] [单元名]
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const COURSE = process.argv[2] || '前端框架开发技术';
const UNIT = process.argv[3] || '使用计算属性';

const pages = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = pages.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) {
  console.error('没找到 study.cqie.edu.cn 的标签页，当前：' + pages.map((p) => p.url).join(' , '));
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pend = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
};
const send = (method, params) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const evl = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails));
  return r.result.value;
};

const probe = `(async()=>{
  const t = localStorage.getItem('token2');
  if (!t) return JSON.stringify({loggedIn:false, url: location.href});
  const u = JSON.parse(localStorage.getItem('userInfo2')||'{}');
  const prof = {id: u.id||'', majorId: u.majorId||'', name: u.name||''};
  if (!prof.id) return JSON.stringify({loggedIn:false, url: location.href, msg:'userInfo2 里没有 id'});
  const H = {Authorization: t, 'Content-Type': 'application/json'};
  const cs = await fetch('/gateway/frequent/orgStudent/pagedMyCourse', {method:'POST', headers:H, body: JSON.stringify({filters:{courseNature:null,name:'',schoolYear:'',studentId:String(prof&&prof.id||''),term:'',courseFlag:0},pageIndex:1,pageSize:50})}).then(r=>r.json()).catch(e=>({err:String(e)}));
  const list = (cs.data && (cs.data.records || cs.data.list)) || [];
  const c = list.find(x => (x.name||'') === ${JSON.stringify(COURSE)}) || list.find(x => (x.name||'').includes(${JSON.stringify(COURSE)}));
  if (!c) return JSON.stringify({loggedIn:true, profId: prof && prof.id, msg:'课程列表没找到这门课', names: list.map(x=>x.name)});
  const sid = c.studentCourseId || c.id;
  const bs = await fetch('/gateway/system/orgStudent/listCourseBarrier?courseId='+c.id+'&majorId='+(prof&&prof.majorId)+'&userId='+prof.id+'&version='+c.version+'&studentCourseId='+sid, {headers:H}).then(r=>r.json());
  const hits = [];
  for (const b of bs.data || []) {
    const ns = await fetch('/gateway/system/orgStudent/listCatalogBarrier?barrierId='+b.id+'&studentCourseId='+sid, {headers:H}).then(r=>r.json());
    for (const n of ns.data || []) {
      if ((n.catalogName||'').indexOf(${JSON.stringify(UNIT)}) === 0) hits.push({barrier:b.name, barrierId:b.id, unitId:n.id, videoId:n.videoId, name:n.catalogName, seconds:n.timeLength, status:n.studyVideoStatus});
    }
  }
  return JSON.stringify({loggedIn:true, who: prof && prof.name, id: prof && prof.id, course:c.name, courseId:c.id, sid:sid, version:c.version, majorId:prof&&prof.majorId, apiCode: cs.code, hits:hits});
})()`;

const out = JSON.parse(await evl(probe));
console.log('登录态:', out.loggedIn ? '在（' + (out.who || '?') + ' / ' + (out.id || '?') + '）' : '丢了，需要重新登录');
console.log('接口 code:', out.apiCode, ' 课程:', out.course);
if (out.hits) {
  for (const h of out.hits) {
    const u = `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=${out.courseId}&studentCourseId=${out.sid}&version=${out.version}&courseUnitId=${h.unitId}&videoId=${h.videoId}&majorId=${out.majorId}`;
    console.log(`  ${h.name}  ${h.seconds}s  studyVideoStatus=${h.status}  关卡=${h.barrier}`);
    console.log(`    ${u}`);
  }
}
ws.close();
process.exit(0);
