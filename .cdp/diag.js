(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const call = async (body) => {
    const r = await (await fetch('/gateway/frequent/orgStudentCourse/myExercises', { method: 'POST', headers: H, body: JSON.stringify(body) })).json();
    const d = r.data;
    const recs = Array.isArray(d) ? d : (d && (d.records || d.list)) || [];
    return { code: r.code, msg: (r.msg || '').slice(0, 30), dataType: Array.isArray(d) ? 'array' : typeof d, keys: d && !Array.isArray(d) ? Object.keys(d).slice(0, 6) : [], n: recs.length, total: d && d.total, q: recs.reduce((a, x) => a + ((x.courseCatalogExercisesConfig || []).length), 0) };
  };
  return JSON.stringify({
    A_pageSize100: await call({ filters: { courseId: '4fafa68754ee9872feb67b4cda5f2c4f', studentId: 'YOUR_STUDENT_ID' }, pageIndex: 1, pageSize: 100 }),
    B_pageSize30: await call({ filters: { courseId: '4fafa68754ee9872feb67b4cda5f2c4f', studentId: 'YOUR_STUDENT_ID' }, pageIndex: 1, pageSize: 30 }),
    C_full_filters: await call({ filters: { courseId: '4fafa68754ee9872feb67b4cda5f2c4f', startTime: '', endTime: '', status: '', studentId: 'YOUR_STUDENT_ID' }, pageIndex: 1, pageSize: 30 }),
  }, null, 1);
})()
