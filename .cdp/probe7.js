(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const prefixes = [
    '/gateway/study/studyRecordExercisesMonitor/',
    '/gateway/study/studyRecordExercise/',
    '/gateway/study/studyRecordExercises/',
    '/gateway/study/courseCatalogExercises/',
    '/gateway/study/exercisesRecord/',
    '/gateway/study/myExercises/',
  ];
  const verbs = ['updateEndTime','updateStartTime','save','add','submit','correct','answer','record','list','detail','create','update','end','start','commit','saveAnswer','submitAnswer','exercisesList','questionDetails','clientPaged','paged'];
  const hits = [];
  for (const p of prefixes) {
    for (const v of verbs) {
      let r;
      try { r = await fetch(p + v, { method: 'POST', headers: H, body: '{}' }); } catch (e) { continue; }
      if (r.status !== 404) {
        let m = '';
        try { const j = JSON.parse(await r.clone().text()); m = 'code' + j.code + ' ' + String(j.msg ?? '').slice(0, 34); } catch (e) { m = 'non-json'; }
        hits.push(p.replace('/gateway/study/', '') + v + ' → ' + m);
      }
    }
  }
  return hits.length ? hits.join('\n') : '全部 404';
})()
