(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const j = await (await fetch('/gateway/study/studyRecordQuestionError/clientPaged', { method: 'POST', headers: H, body: JSON.stringify({ filters: { studentId: 'YOUR_STUDENT_ID' }, pageIndex: 1, pageSize: 100 }) })).json();
  const recs = (j.data && (j.data.list || j.data.records)) || [];
  const g = {};
  recs.forEach((r) => { const k = r.courseName + ' | ' + r.sourceTypeName + ' | status' + r.status; g[k] = (g[k] || 0) + 1; });
  return JSON.stringify({ total: j.data && j.data.total, n: recs.length, byCourse: g, types: [...new Set(recs.map((r) => r.questionTypeName))] }, null, 1);
})()
