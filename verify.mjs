// 课程完成度核验：只读，输出平台自己认的账，用于判断"自动播放"是否真的完成
//   node verify.mjs [--course 软件系统分析与设计]
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const fs = await import('node:fs');
const path = await import('node:path');
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const COURSE = arg('--course', '软件系统分析与设计');
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');

const pages = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
let runnerId = null;
try {
  runnerId = JSON.parse(fs.readFileSync(path.join(ROOT, '.cdp', 'runner-tab.json'), 'utf8')).id;
} catch (e) {}
const tab = pages.find((t) => t.url.includes('study.cqie.edu.cn') && t.id !== runnerId) || pages.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!tab) {
  console.error('没有空闲标签页');
  process.exit(1);
}
let seq = 0;
const inflight = new Map();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(new Error('ws 失败'));
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
await send('Runtime.enable');
const evl = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || '').slice(0, 200));
  return r.result?.value;
};
if (!tab.url.includes('study.cqie.edu.cn')) {
  await send('Page.navigate', { url: 'https://study.cqie.edu.cn/stu/home' });
  await new Promise((r) => setTimeout(r, 9000));
}

const rep = JSON.parse(
  await evl(`(async () => {
    const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
    const g = async (u) => JSON.parse(await (await fetch(u, { headers: H })).text());
    const p = async (u, b) => JSON.parse(await (await fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) })).text());
    const me = (JSON.parse(localStorage.getItem('userInfo2') || '{}').id) || '';
    const cs = await p('/gateway/frequent/orgStudent/pagedMyCourse', { filters: { courseNature: null, name: '', schoolYear: '', studentId: me, term: '', courseFlag: 0 }, pageIndex: 1, pageSize: 50 });
    const c = ((cs.data && (cs.data.records || cs.data.list)) || []).find((x) => x.name === ${JSON.stringify(COURSE)});
    if (!c) return JSON.stringify({ err: '没找到课程', names: ((cs.data && (cs.data.records || cs.data.list)) || []).map((x) => x.name) });
    const bs = await g('/gateway/system/orgStudent/listCourseBarrier?courseId=' + c.id + '&majorId=' + (c.majorId || '') + '&userId=' + me + '&version=' + c.version + '&studentCourseId=' + c.studentCourseId);
    const barriers = [];
    for (const b of (bs.data || []).sort((x, y) => (x.sortCode || 0) - (y.sortCode || 0))) {
      const vids = ((await g('/gateway/system/orgStudent/listCatalogBarrier?barrierId=' + b.id + '&studentCourseId=' + c.studentCourseId)).data || []).filter((n) => n.videoId);
      const pr = (await g('/gateway/system/orgStudent/barrierStudyProgress?barrierId=' + b.id + '&studentCourseId=' + c.studentCourseId + '&version=' + c.version)).data || {};
      barriers.push({ name: b.name, total: vids.length, learned: pr.haveLearned || 0, secs: vids.reduce((a, v) => a + (v.timeLength || 0), 0) });
    }
    let det = {};
    try {
      det = (await g('/gateway/system/orgStudent/myCourseDetails?studentId=' + me + '&id=' + c.id + '&majorId=' + (c.majorId || '') + '&studentCourseId=' + c.studentCourseId + '&version=' + c.version)).data || {};
    } catch (e) {}
    return JSON.stringify({ course: c.name, learned: c.learned, haveUnit: det.haveUnit ?? c.haveUnit, sumUnit: det.sumUnit ?? c.sumUnit, haveTime: det.haveTime, sumTime: det.sumTime, haveEx: det.haveExercises, sumEx: det.sumExercises, isBarrierCourse: barriers.length > 0, barrierCount: barriers.length, barriers });
  })()`)
);
if (rep.err) {
  console.error(rep.err, '可选：', (rep.names || []).join(' / '));
  process.exit(1);
}
const done = rep.barriers.filter((b) => b.total > 0 && b.learned >= b.total).length;
const missing = rep.barriers.filter((b) => b.learned < b.total);
console.log(`课程：${rep.course}`);
console.log(`  已学 ${rep.learned} | 任务 ${rep.haveUnit}/${rep.sumUnit} | 时长 ${rep.haveTime}/${rep.sumTime} | 练习 ${rep.haveEx}/${rep.sumEx}`);
if (!rep.isBarrierCourse) console.log('  ⚠ 非闯关制课程：listCourseBarrier 返回空，关卡级统计不可用（需按目录节点枚举）');
console.log(`  关卡 ${done}/${rep.barrierCount} 已全学完${missing.length ? '，未完成：' + missing.map((b) => `${b.name}(${b.learned}/${b.total})`).join('、') : ''}`);
const secs = rep.barriers.reduce((a, b) => a + b.secs, 0);
console.log(`  关卡内视频共 ${rep.barriers.reduce((a, b) => a + b.total, 0)} 条 / ${Math.round(secs / 60)} 分钟`);
ws.close();
process.exit(0);
