(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const out = [];
  for (const u of ['/gateway/study/review/exercises/commit', '/gateway/study/review/task/paged', '/gateway/study/review/exercises/commitList']) {
    const r = await fetch(u, { method: 'POST', headers: H, body: '{}' });
    out.push(u.replace('/gateway/study/', '') + ' → ' + (await r.text()).slice(0, 90).replace(/\s+/g, ' '));
  }
  const list = JSON.parse(await (await fetch('/gateway/frequent/orgStudentCourse/myExercises', { method: 'POST', headers: H, body: JSON.stringify({ filters: { courseId: '4fafa68754ee9872feb67b4cda5f2c4f', studentId: 'YOUR_STUDENT_ID' }, pageIndex: 1, pageSize: 100 }) })).text());
  const recs = (list.data && (list.data.list || list.data.records)) || [];
  const rec = recs.find((r) => r.catalogName === '需求收集与整理') || recs[0];
  const base = { studentCourseId: '255b69a5ce54ba7a2c6caa5321b323f7', courseId: '4fafa68754ee9872feb67b4cda5f2c4f', version: 'BK_RJGC_2024', unitId: rec.unitId, courseName: '软件系统分析与设计', catalogName: rec.catalogName, readType: '1', submitTime: '', t: String(Date.now()) };
  const lst = await (await fetch('/gateway/study/studyRecordExercises/exercisesList', { method: 'POST', headers: H, body: JSON.stringify(base) })).json();
  out.push('【重测 exercisesList】 code=' + lst.code + ' msg=' + String(lst.msg).slice(0, 30));
  return out.join('\n');
})()
