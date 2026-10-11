// 海浪智学 · 练习答题模块
// 用法：node exercises.mjs [--unit 单元名] [--apply]
//   默认只做「答案解析 + 会话链路」自检，不提交任何东西；--apply 才会真的作答
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const fs = await import('node:fs');
const path = await import('node:path');
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const has = (n) => process.argv.includes(n);
const STUDENT_ID = arg('--studentId', 'YOUR_STUDENT_ID');
const COURSE_NAME = arg('--course', '软件系统分析与设计');
const APPLY = has('--apply');
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const LOCK = path.join(ROOT, '.cdp', 'explore-tab.json');

const TYPE = { 1: '单选题', 2: '多选题', 3: '判断题', 4: '填空题', 5: '简答题', 6: '问答题', 7: '编程题', 8: '设计题', 9: '框架编程题', 10: 'WPS操作题' };
const OBJECTIVE = new Set([1, 2, 3]);

const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const listPages = async () => (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const pages = await listPages();
let pinned = null;
try {
  pinned = JSON.parse(fs.readFileSync(LOCK, 'utf8')).id;
} catch (e) {}
// 绝不碰 runner 独占的那个标签页，否则会打断正在放的视频
let runnerId = null;
try {
  runnerId = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id;
} catch (e) {}
const tab = (pinned && pages.find((t) => t.id === pinned)) || pages.find((t) => t.url.includes('study.cqie.edu.cn') && t.id !== runnerId) || pages.find((t) => t.id !== runnerId);
if (!tab) {
  console.error('没有可用标签页');
  process.exit(1);
}
fs.writeFileSync(LOCK, JSON.stringify({ id: tab.id, at: new Date().toISOString() }, null, 1));

let seq = 0;
const inflight = new Map();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(new Error('CDP ws 失败'));
  ws.onmessage = (m) => {
    const x = JSON.parse(m.data);
    if (x.id && inflight.has(x.id)) {
      const p = inflight.get(x.id);
      inflight.delete(x.id);
      x.error ? p.rej(new Error(x.error.message)) : p.res(x.result);
    }
  };
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    inflight.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evl = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'eval 异常').slice(0, 300));
  return r.result?.value;
};
const api = (method, url, body) =>
  evl(
    `fetch(${JSON.stringify(url)}, {method:${JSON.stringify(method)}, headers:{Authorization: localStorage.getItem('token2'),'Content-Type':'application/json'}, body: ${body === undefined ? 'undefined' : JSON.stringify(JSON.stringify(body))}}).then(r=>r.text())`
  ).then((t) => JSON.parse(t));

// 按课程名解析真实 ID：之前把 courseId 写死，导致 --course 换课时其实还在测老课程
const resolved = JSON.parse(
  await evl(`(async () => {
    const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
    const me = (JSON.parse(localStorage.getItem('userInfo2') || '{}').id) || '';
    const cs = await (await fetch('/gateway/frequent/orgStudent/pagedMyCourse', { method: 'POST', headers: H, body: JSON.stringify({ filters: { courseNature: null, name: '', schoolYear: '', studentId: me, term: '', courseFlag: 0 }, pageIndex: 1, pageSize: 50 }) })).json();
    const list = (cs.data && (cs.data.records || cs.data.list)) || [];
    const c = list.find((x) => x.name === ${JSON.stringify(COURSE_NAME)});
    return JSON.stringify(c ? { courseId: c.id, studentCourseId: c.studentCourseId, version: c.version, found: true } : { found: false, names: list.map((x) => x.name) });
  })()`).then((t) => { try { return t; } catch (e) { return null; } })
);
if (!resolved || !resolved.found) {
  console.error('没找到课程「' + COURSE_NAME + '」，可选：' + ((resolved && resolved.names) || []).join(' / '));
  process.exit(1);
}
const COURSE_ID = arg('--courseId', resolved.courseId);
const STUDENT_COURSE_ID = arg('--studentCourseId', resolved.studentCourseId);
const VERSION = arg('--version', resolved.version);
log(`课程=${COURSE_NAME} courseId=${COURSE_ID.slice(0, 8)}… version=${VERSION}`);

if (!tab.url.includes('study.cqie.edu.cn')) {
  await send('Page.navigate', { url: 'https://study.cqie.edu.cn/stu/home' });
  await sleep(8000);
}

// 把平台下发的 referenceAnswer 归一成「选项ID数组」；判断题归一成布尔语义
function parseAnswer(q) {
  const raw = String(q.answer ?? '').trim();
  if (!raw) return { ok: false, why: '无参考答案' };
  if (q.questionType === 3) return { ok: true, kind: 'judge', value: raw === '1' ? '对' : '错', ids: [raw] };
  if (q.questionType === 1) return /^[0-9a-f]{32}$/.test(raw) ? { ok: true, kind: 'single', ids: [raw] } : { ok: false, why: '单选答案格式异常:' + raw.slice(0, 20) };
  if (q.questionType === 2) {
    const ids = raw.split('|').filter((s) => /^[0-9a-f]{32}$/.test(s));
    return ids.length >= 2 ? { ok: true, kind: 'multi', ids } : { ok: false, why: '多选答案解析失败:' + raw.slice(0, 30) };
  }
  return { ok: false, why: '非客观题（' + (TYPE[q.questionType] || q.questionType) + '），不自动作答' };
}

const list = await api('POST', '/gateway/frequent/orgStudentCourse/myExercises', { filters: { courseId: COURSE_ID, studentId: STUDENT_ID }, pageIndex: 1, pageSize: 100 });
const recs = (list.data && (list.data.list || list.data.records)) || [];
const units = new Map();
recs.forEach((rec) => (rec.courseCatalogExercisesConfig || []).forEach((e) => {
  if (!units.has(e.unitId)) units.set(e.unitId, { unitId: e.unitId, catalogName: rec.catalogName, qs: [] });
  units.get(e.unitId).qs.push({ exerciseId: e.exerciseId, questionType: e.questionType, content: e.content, answer: e.referenceAnswer, score: e.score });
}));

let objN = 0, nonObjN = 0, badN = 0;
for (const u of units.values()) {
  for (const q of u.qs) {
    const p = parseAnswer(q);
    if (p.ok) objN++;
    else if (p.why.startsWith('非客观题')) nonObjN++;
    else { badN++; log(`  ! ${u.catalogName} 答案解析失败: ${p.why}`); }
  }
}
log(`单元 ${units.size} 组 / 客观题可自动作答 ${objN} 道 / 非客观题 ${nonObjN} 道（留给你）/ 解析异常 ${badN} 道`);
if (badN) log('  ↑ 解析异常要先解决，否则整批作答不可信');

// 会话链路自检：checkUpdateExercises 已知可用，exercisesList 目前被平台侧 501 挡住
const target = arg('--unit', '') ? [...units.values()].find((u) => u.catalogName === arg('--unit')) : [...units.values()].find((u) => u.qs.some((q) => OBJECTIVE.has(q.questionType)));
log(`自检单元：${target.catalogName}（${target.qs.length} 道）`);
const base = { studentCourseId: STUDENT_COURSE_ID, courseId: COURSE_ID, version: VERSION, unitId: target.unitId, courseName: COURSE_NAME, catalogName: target.catalogName };
const chk = await api('POST', '/gateway/study/courseCatalogExercisesConfig/checkUpdateExercises', base);
log('checkUpdateExercises →', JSON.stringify(chk.data || chk.msg));
const qs = await api('POST', '/gateway/study/studyRecordExercises/exercisesList', { ...base, operationId: chk.data && chk.data.operationId });
log('exercisesList → code=' + qs.code + ' msg=' + String(qs.msg).slice(0, 50));
const arr = (qs.data && (qs.data.list || qs.data.records)) || (Array.isArray(qs.data) ? qs.data : null);
if (!arr) {
  log('  拿不到题目列表 —— 平台自己的答题页此刻也报同一个错，作答无法继续。等会话窗口过期后重试。');
  process.exit(2);
}
log(`  拿到 ${arr.length} 道题，首题字段：` + Object.keys(arr[0]).slice(0, 18).join(','));
log('  选项结构：' + JSON.stringify(arr[0].options || arr[0].exerciseOptions || arr[0].questionOptions || '未找到选项字段').slice(0, 500));
ws.close();
process.exit(0);
