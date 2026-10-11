(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const j = await (await fetch('/gateway/study/studyRecordQuestionError/questionDetails', { method: 'POST', headers: H, body: JSON.stringify({ exercisesId: '72e256918add84f697a39f031df820b8' }) })).json();
  const d = j.data || {};
  return JSON.stringify({
    keys: Object.keys(d),
    optionsField: Object.keys(d).filter((k) => /option|answer|choice|item/i.test(k)).map((k) => k + '=' + JSON.stringify(d[k]).slice(0, 300)),
  }, null, 1);
})()
