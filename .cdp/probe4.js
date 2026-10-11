(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const E = '72e256918add84f697a39f031df820b8', R = '975c14d24c844da9ac7642f4e9ddfdb6', A = 'bb2770182dba0e7f5e3ef2e9228bfa08';
  const raw = async (b) => {
    const r = await fetch('/gateway/study/studyRecordQuestionError/correct', { method: 'POST', headers: H, body: JSON.stringify(b) });
    return JSON.stringify(b).slice(0, 120) + '\n   → http' + r.status + ' ' + (await r.text()).slice(0, 260);
  };
  return [(await raw({ exercisesId: E, submitAnswer: A })), (await raw({ exercisesId: E, submitAnswer: A, recordId: R })), (await raw({ exercisesId: E, submitAnswer: A, id: R }))].join('\n\n');
})()
