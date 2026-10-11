(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const post = async (u, b) => JSON.parse(await (await fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) })).text());
  const mk = await post('/gateway/study/studyRecordQuestionError/clientPaged', { filters: { studentId: 'YOUR_STUDENT_ID' }, pageIndex: 1, pageSize: 100 });
  const recs = ((mk.data && (mk.data.list || mk.data.records)) || []).filter((r) => r.status === 0);
  const out = [];
  for (const r of recs) {
    const q = (await post('/gateway/study/studyRecordQuestionError/questionDetails', { exercisesId: r.exercisesId })).data || {};
    out.push({
      题干: String(q.content || '').replace(/<[^>]+>/g, '').slice(0, 30),
      type: q.questionType + '/' + q.questionTypeName,
      ref: q.referenceAnswer,
      我上次答的: q.submitAnswer,
      options: (q.optionVos || []).map((o) => ({ id: o.id.slice(0, 8), txt: String(o.optionContent).replace(/<[^>]+>/g, ''), flag: o.answerFlag })),
    });
  }
  return JSON.stringify(out, null, 1);
})()
