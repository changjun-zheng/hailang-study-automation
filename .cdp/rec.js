(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const post = async (u, b) => { const r = await (await fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) })).json(); return r; };
  const tries = {};
  const a = await post('/gateway/study/studyRecordExercises/paged', { filters: { studentId: 'YOUR_STUDENT_ID', courseId: '4fafa68754ee9872feb67b4cda5f2c4f' }, pageIndex: 1, pageSize: 10 });
  tries.byCourse = { code: a.code, msg: a.msg, n: a.data && (a.data.total ?? (a.data.list || a.data.records || []).length) };
  const b = await post('/gateway/study/studyRecordExercises/paged', { filters: { studentId: 'YOUR_STUDENT_ID' }, pageIndex: 1, pageSize: 10 });
  tries.all = { code: b.code, n: b.data && (b.data.total ?? (b.data.list || b.data.records || []).length) };
  const recs = (b.data && (b.data.list || b.data.records)) || [];
  tries.sample = recs.slice(0, 3).map((r) => JSON.stringify(r).slice(0, 320));
  tries.keys = recs[0] ? Object.keys(recs[0]) : [];
  return JSON.stringify(tries, null, 1);
})()
