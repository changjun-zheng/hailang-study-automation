(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const names = ['createList','createCheckList','createExercisesList','checkStudyRecordExercises','exerciseBarrier','clearStudentUnit','applyReReview','batchDeleteByIds'];
  const out = [];
  for (const n of names) {
    const r = await fetch('/gateway/study/studyRecordExercises/' + n, { method: 'POST', headers: H, body: '{}' });
    let m = '';
    try { const j = JSON.parse(await r.clone().text()); m = 'http' + r.status + ' code' + j.code + ' ' + String(j.msg ?? '').slice(0, 40) + ' data=' + JSON.stringify(j.data).slice(0, 60); } catch (e) { m = 'http' + r.status + ' non-json'; }
    out.push(n + ' → ' + m);
  }
  return out.join('\n');
})()
