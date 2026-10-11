(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const post = async (u, b) => JSON.parse(await (await fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) })).text());
  const cs = await post('/gateway/frequent/orgStudent/pagedMyCourse', { filters: { courseNature: null, name: '', schoolYear: '', studentId: 'YOUR_STUDENT_ID', term: '', courseFlag: 0 }, pageIndex: 1, pageSize: 50 });
  const c = ((cs.data && (cs.data.records || cs.data.list)) || []).find((x) => x.name === '软件系统分析与设计') || {};
  return JSON.stringify({ 已学: c.learned, 任务: c.haveUnit + '/' + c.sumUnit, 关卡状态: c.barrierStatus, 课程状态: c.courseStatus }, null, 1);
})()
