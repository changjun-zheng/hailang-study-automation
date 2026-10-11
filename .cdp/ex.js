(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const call = async (u, b) => (await (await fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) })).json());
  const a = await call('/gateway/frequent/orgStudentCourse/myExercises', { filters: { courseId: '4fafa68754ee9872feb67b4cda5f2c4f', startTime: '', endTime: '', status: '', studentId: 'YOUR_STUDENT_ID' }, pageIndex: 1, pageSize: 30 });
  const rec = (a.data && (a.data.records || a.data.list)) || [];
  const one = rec[0] || {};
  return JSON.stringify({
    total: a.data && a.data.total,
    n: rec.length,
    keys: Object.keys(one),
    items: rec.slice(0, 12).map((r) => ({ name: (r.name || r.title || '').slice(0, 30), status: r.statusName || r.status, score: r.score, type: r.exerciseTypeName ?? r.type ?? r.questionTypeName ?? '' })),
    firstRaw: JSON.stringify(one).slice(0, 900),
  }, null, 1);
})()
