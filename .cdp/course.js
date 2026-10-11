(async () => {
  const r = await fetch('/gateway/frequent/orgStudent/pagedMyCourse', {
    method: 'POST',
    headers: { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ filters: { courseNature: null, majorId: '9f07cf1e06d0a57957bd6be34efd3930', name: '', schoolYear: '', studentId: 'YOUR_STUDENT_ID', term: '', courseFlag: 0 }, pageIndex: 1, pageSize: 20 }),
  });
  const j = await r.json();
  const list = (j.data && j.data.records) || [];
  window.__courses = list;
  return JSON.stringify(list.map((c) => ({ name: c.name, id: c.id, clazzId: c.clazzId, studentCourseId: c.studentCourseId, version: c.version, learned: c.learned, sumUnit: c.sumUnit, haveUnit: c.haveUnit })), null, 1);
})()
