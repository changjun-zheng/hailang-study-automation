(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const r = await (await fetch('/gateway/frequent/orgStudentCourse/myExercises', { method: 'POST', headers: H, body: JSON.stringify({ filters: { courseId: '4fafa68754ee9872feb67b4cda5f2c4f', startTime: '', endTime: '', status: '', studentId: 'YOUR_STUDENT_ID' }, pageIndex: 1, pageSize: 100 }) })).json();
  const recs = (r.data && (r.data.list || r.data.records)) || [];
  const all = [];
  recs.forEach((rec) => (rec.courseCatalogExercisesConfig || []).forEach((e) => all.push({ t: e.questionType, c: (e.content || '').replace(/\s+/g, ' ').slice(0, 40), a: String(e.referenceAnswer || '').slice(0, 40), lang: e.language, sc: !!e.scoreCriteria, file: !!e.baseFileUrl })));
  const byType = {};
  all.forEach((q) => ((byType[q.t] = byType[q.t] || []).push(q)));
  return JSON.stringify({ code: r.code, nRec: recs.length, nQ: all.length, types: Object.fromEntries(Object.entries(byType).map(([k, v]) => ['type' + k, { n: v.length, s: v.slice(0, 2) }])) }, null, 1).slice(0, 2800);
})()
