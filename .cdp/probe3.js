(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const call = async (u, b) => {
    const r = await fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) });
    let code = '', msg = '';
    try { const j = JSON.parse(await r.clone().text()); code = j.code; msg = String(j.msg || '').slice(0, 46); } catch (e) { msg = (await r.text()).slice(0, 40); }
    return 'http' + r.status + ' code' + code + ' ' + msg;
  };
  const E = '72e256918add84f697a39f031df820b8';
  const R = '975c14d24c844da9ac7642f4e9ddfdb6';
  const A = 'bb2770182dba0e7f5e3ef2e9228bfa08';
  const steps = {};
  steps['correct:exercisesId'] = await call('/gateway/study/studyRecordQuestionError/correct', { exercisesId: E });
  steps['correct:+answer'] = await call('/gateway/study/studyRecordQuestionError/correct', { exercisesId: E, answer: A });
  steps['correct:+submitAnswer'] = await call('/gateway/study/studyRecordQuestionError/correct', { exercisesId: E, submitAnswer: A });
  steps['correct:+answerIds'] = await call('/gateway/study/studyRecordQuestionError/correct', { exercisesId: E, answerIds: [A] });
  const exNames = ['answer', 'saveAnswer', 'submitAnswer', 'answerExercises', 'exercisesAnswer', 'commit', 'correct', 'submitExercises', 'saveRecord', 'recordExercises'];
  const hits = [];
  for (const n of exNames) {
    const s = await call('/gateway/study/studyRecordExercises/' + n, {});
    if (!s.includes('http404')) hits.push(n + ' → ' + s);
  }
  return JSON.stringify({ steps, exerciseRouteHits: hits }, null, 1);
})()
