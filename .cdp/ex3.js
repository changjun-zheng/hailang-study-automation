(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const a = await (await fetch('/gateway/frequent/orgStudentCourse/myExercises', { method: 'POST', headers: H, body: JSON.stringify({ filters: { courseId: '4fafa68754ee9872feb67b4cda5f2c4f', studentId: 'YOUR_STUDENT_ID' }, pageIndex: 1, pageSize: 30 }) })).json();
  const rec = (a.data && (a.data.records || a.data.list)) || [];
  const cfgs = rec[0].courseCatalogExercisesConfig;
  return JSON.stringify({ catalog: rec[0].catalogName, cfgCount: cfgs.length, cfg0: cfgs[0], cfg1keys: Object.keys(cfgs[1] || {}) }, null, 1).slice(0, 2500);
})()
