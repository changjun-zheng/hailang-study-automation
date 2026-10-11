(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const mk = await (await fetch('/gateway/study/studyRecordQuestionError/clientPaged', { method: 'POST', headers: H, body: JSON.stringify({ filters: { studentId: 'YOUR_STUDENT_ID' }, pageIndex: 1, pageSize: 5 }) })).json();
  const recs = (mk.data && (mk.data.list || mk.data.records)) || [];
  const st = await (await fetch('/gateway/study/studyRecordQuestionError/questionDetails', { method: 'POST', headers: H, body: JSON.stringify({ exercisesId: '72e256918add84f697a39f031df820b8' }) })).json();
  return JSON.stringify({
    错题总数: mk.data && mk.data.total,
    列表: recs.map((r) => r.content.slice(0, 18) + ' | status=' + r.status + ' | 次数=' + r.errorCount),
    该题当前状态: { status: st.data.status, submitAnswer: st.data.submitAnswer, displayAnswerFlag: st.data.displayAnswerFlag },
  }, null, 1);
})()
