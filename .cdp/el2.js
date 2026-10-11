(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const post = async (u, b) => JSON.parse(await (await fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) })).text());
  const base = { studentCourseId: '255b69a5ce54ba7a2c6caa5321b323f7', courseId: '4fafa68754ee9872feb67b4cda5f2c4f', version: 'BK_RJGC_2024', unitId: '637e13855783d8a848d38a25bded5d2f', courseName: '软件系统分析与设计', catalogName: '需求收集与整理' };
  const chk = await post('/gateway/study/courseCatalogExercisesConfig/checkUpdateExercises', base);
  const op = chk.data && chk.data.operationId;
  const out = {};
  const t = async (name, extra) => {
    const r = await post('/gateway/study/studyRecordExercises/exercisesList', { ...base, operationId: op, ...extra });
    const arr = r.data && (r.data.list || r.data.records);
    out[name] = 'code' + r.code + ' ' + String(r.msg).slice(0, 26) + (Array.isArray(arr) ? ' n=' + arr.length : '');
  };
  await t('+studentId', { studentId: 'YOUR_STUDENT_ID' });
  await t('+catalogId', { catalogId: '637e13855783d8a848d38a25bded5d2f' });
  await t('+barrierId', { barrierId: '22b61644d5062d3d19c0dbc144cea40d' });
  await t('+all', { studentId: 'YOUR_STUDENT_ID', catalogId: '637e13855783d8a848d38a25bded5d2f', barrierId: '22b61644d5062d3d19c0dbc144cea40d', courseVersionId: 'f46e56d2ab23fbd55f60eb6984f41d81', readType: 1 });
  await t('GET-ish empty', { studentCourseId: '255b69a5ce54ba7a2c6caa5321b323f7', courseId: '4fafa68754ee9872feb67b4cda5f2c4f' });
  return JSON.stringify({ flag: chk.data, out }, null, 1);
})()
