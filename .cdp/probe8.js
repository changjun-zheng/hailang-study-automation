(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const prefixes = [
    '/gateway/study/studyRecordExercises/',
    '/gateway/frequent/orgStudentCourse/',
    '/gateway/study/courseCatalogExercises/',
    '/gateway/study/courseCatalogExercisesConfig/',
  ];
  const verbs = ['studentSubmit','studentCorrect','studentAnswer','studentSave','submitStudent','studentDetail','submitExercisesAnswer','answerExercises','saveExercises','exerciseSubmit','submitRecord','doSubmit','submitExercise','correctExercises','saveSubmit','updateSubmit','studentList'];
  const hits = new Set();
  for (const p of prefixes) {
    for (const v of verbs) {
      const r = await fetch(p + v, { method: 'POST', headers: H, body: '{}' });
      if (r.status !== 404) {
        let m = '';
        try { const j = JSON.parse(await r.clone().text()); m = 'code' + j.code + ' ' + String(j.msg ?? '').slice(0, 30); } catch (e) { m = 'non-json'; }
        hits.add(p.replace('/gateway/', '') + v + ' → ' + m);
      }
    }
  }
  return hits.size ? [...hits].join('\n') : '全部 404';
})()
