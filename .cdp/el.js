(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const post = async (u, b) => JSON.parse(await (await fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) })).text());
  const list = await post('/gateway/frequent/orgStudentCourse/myExercises', { filters: { courseId: '4fafa68754ee9872feb67b4cda5f2c4f', studentId: 'YOUR_STUDENT_ID' }, pageIndex: 1, pageSize: 100 });
  const recs = (list.data && (list.data.list || list.data.records)) || [];
  const rec = recs.find((r) => r.catalogName === '需求收集与整理') || recs[0];
  const cfg = rec.courseCatalogExercisesConfig[0];
  const base = { studentCourseId: '255b69a5ce54ba7a2c6caa5321b323f7', courseId: '4fafa68754ee9872feb67b4cda5f2c4f', version: 'BK_RJGC_2024', unitId: cfg.unitId, courseName: '软件系统分析与设计', catalogName: rec.catalogName };
  const chk = await post('/gateway/study/courseCatalogExercisesConfig/checkUpdateExercises', base);
  const op = chk.data && chk.data.operationId;
  const variants = {
    plain: base,
    '+operationId': { ...base, operationId: op },
    '+courseVersionId': { ...base, operationId: op, courseVersionId: cfg.courseVersionId },
    '+rootUnitId': { ...base, operationId: op, courseVersionId: cfg.courseVersionId, rootUnitId: cfg.rootUnitId },
    '+ids': { ...base, operationId: op, exerciseIds: rec.courseCatalogExercisesConfig.map((e) => e.exerciseId) },
    '+readType': { ...base, operationId: op, readType: 1 },
  };
  const out = {};
  for (const [k, b] of Object.entries(variants)) {
    const r = await post('/gateway/study/studyRecordExercises/exercisesList', b);
    const arr = r.data && (r.data.list || r.data.records) || (Array.isArray(r.data) ? r.data : null);
    out[k] = 'code' + r.code + ' ' + String(r.msg).slice(0, 30) + (arr ? ' n=' + arr.length : '');
  }
  return JSON.stringify({ unit: rec.catalogName, cvId: cfg.courseVersionId, out }, null, 1);
})()
