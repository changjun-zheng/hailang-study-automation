(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const paths = [
    '/gateway/study/courseCatalogExercisesConfig/updateExercises',
    '/gateway/study/courseCatalogExercisesConfig/syncExercises',
    '/gateway/study/courseCatalogExercisesConfig/exercisesDetail',
    '/gateway/study/courseCatalogExercisesConfig/detail',
    '/gateway/study/studyRecordExercises/start',
    '/gateway/study/studyRecordExercises/save',
    '/gateway/study/studyRecordExercises/submit',
    '/gateway/study/studyRecordExercises/submitExercises',
    '/gateway/study/studyRecordExercises/current',
    '/gateway/study/studyRecordExercises/detail',
    '/gateway/study/studyRecordExercises/info',
    '/gateway/study/studyRecordExercises/exercisesDetail',
  ];
  const out = [];
  for (const p of paths) {
    try {
      const r = await fetch(p, { method: 'POST', headers: H, body: '{}' });
      const t = await r.text();
      let code = '', msg = '';
      try { const j = JSON.parse(t); code = j.code; msg = String(j.msg || '').slice(0, 40); } catch (e) { msg = t.slice(0, 40); }
      out.push(p.replace('/gateway/study/', '') + ' → http' + r.status + ' code' + code + ' ' + msg);
    } catch (e) {
      out.push(p + ' ERR ' + String(e).slice(0, 30));
    }
  }
  return out.join('\n');
})()
