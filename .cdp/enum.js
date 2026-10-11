(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const en = await (await fetch('/gateway/study/courseCatalogExercises/enum/item/0', { headers: H })).json();
  const mk = await (await fetch('/gateway/study/studyRecordQuestionError/clientPaged', { method: 'POST', headers: H, body: JSON.stringify({ filters: { studentId: 'YOUR_STUDENT_ID' }, pageIndex: 1, pageSize: 3 }) })).json();
  const recs = (mk.data && (mk.data.list || mk.data.records)) || [];
  return JSON.stringify({
    enum: JSON.stringify(en).slice(0, 700),
    mkCode: mk.code, mkN: recs.length,
    mk0: JSON.stringify(recs[0] || {}).slice(0, 1600),
  }, null, 1);
})()
