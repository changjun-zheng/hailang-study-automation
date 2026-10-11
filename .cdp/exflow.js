(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const post = async (u, b) => (await (await fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) })).json());
  const courseId = '4fafa68754ee9872feb67b4cda5f2c4f', studentCourseId = '255b69a5ce54ba7a2c6caa5321b323f7', version = 'BK_RJGC_2024';
  const list = await post('/gateway/frequent/orgStudentCourse/myExercises', { filters: { courseId, studentId: 'YOUR_STUDENT_ID' }, pageIndex: 1, pageSize: 100 });
  const recs = (list.data && (list.data.list || list.data.records)) || [];
  const rec = recs.find((r) => (r.catalogName || '') === '明确系统目标') || recs[0];
  const base = { studentCourseId, courseId, version, unitId: rec.unitId, courseName: '软件系统分析与设计', catalogName: rec.catalogName };
  const chk = await post('/gateway/study/courseCatalogExercisesConfig/checkUpdateExercises', base);
  const body2 = { ...base, operationId: chk.data && chk.data.operationId };
  const qs = await post('/gateway/study/studyRecordExercises/exercisesList', body2);
  const arr = (qs.data && (qs.data.list || qs.data.records)) || qs.data || [];
  const q0 = Array.isArray(arr) ? arr[0] : null;
  return JSON.stringify({
    unit: rec.catalogName, cfgN: (rec.courseCatalogExercisesConfig || []).length,
    check: chk,
    listCode: qs.code, listMsg: (qs.msg || '').slice(0, 40),
    nQ: Array.isArray(arr) ? arr.length : typeof arr,
    q0: q0 ? JSON.stringify(q0).slice(0, 1500) : JSON.stringify(qs).slice(0, 600),
  }, null, 1);
})()
