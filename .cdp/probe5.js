(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const names = ['submitExercises','exercisesSubmit','exercisesAnswer','answerExercises','exercisesDetail','exercisesDetails','exercisesCorrect','exercisesUpdate','updateExercises','submitRecord','saveRecord','updateRecord','recordExercises','begin','start','init','create','add','save','update','commit','answer','submit','myExercises','recordList','exerciseList','questionList'];
  const hits = [];
  for (const n of names) {
    for (const pre of ['/gateway/study/studyRecordExercises/', '/gateway/study/courseCatalogExercises/']) {
      const r = await fetch(pre + n, { method: 'POST', headers: H, body: '{}' });
      if (r.status !== 404) {
        let m = '';
        try { const j = JSON.parse(await r.clone().text()); m = 'code' + j.code + ' ' + String(j.msg ?? '').slice(0, 30); } catch (e) { m = 'non-json'; }
        hits.push((pre.includes('studyRecord') ? 'recordExercises/' : 'catalogExercises/') + n + ' → ' + m);
      }
    }
  }
  return hits.length ? hits.join('\n') : '无命中';
})()
