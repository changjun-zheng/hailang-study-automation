(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const out = [];
  for (const n of ['checkStudyRecordExercises', 'createExercisesList', 'createCheckList', 'exerciseBarrier']) {
    const r = await fetch('/gateway/study/studyRecordExercises/' + n, { method: 'POST', headers: H, body: '{}' });
    const t = await r.text();
    out.push(n + ' → http' + r.status + ' ct=' + (r.headers.get('content-type') || '') + ' body=' + t.slice(0, 160).replace(/\s+/g, ' '));
  }
  return out.join('\n\n');
})()
