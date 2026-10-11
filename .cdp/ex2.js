(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const a = await (await fetch('/gateway/frequent/orgStudentCourse/myExercises', { method: 'POST', headers: H, body: JSON.stringify({ filters: { courseId: '4fafa68754ee9872feb67b4cda5f2c4f', startTime: '', endTime: '', status: '', studentId: 'YOUR_STUDENT_ID' }, pageIndex: 1, pageSize: 30 }) })).json();
  const rec = (a.data && (a.data.records || a.data.list)) || [];
  return JSON.stringify({
    n: rec.length,
    list: rec.slice(0, 20).map((r) => ({ cat: (r.catalogName || '').slice(0, 18), cfg: (r.courseCatalogExercisesConfig ? Object.keys(r.courseCatalogExercisesConfig).slice(0, 14).join(',') : 'null'), score: r.sumScore, deadline: r.deadLine })),
    raw0: JSON.stringify(rec[0]).slice(0, 1600),
  }, null, 1);
})()
