(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const j = await (await fetch('/gateway/study/studyRecordQuestionError/questionDetails', { method: 'POST', headers: H, body: JSON.stringify({ exercisesId: '72e256918add84f697a39f031df820b8' }) })).json();
  const d = j.data || {};
  return JSON.stringify({
    optionVos: (d.optionVos || []).map((o) => ({ keys: Object.keys(o), v: o })),
    submitAnswer: d.submitAnswer,
    displayAnswerFlag: d.displayAnswerFlag,
    status: d.status,
    accuracy: d.accuracy,
  }, null, 1).slice(0, 2200);
})()
