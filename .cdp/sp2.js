(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const body = { asc: '', desc: '', filters: { clazzId: '', courseId: '4fafa68754ee9872feb67b4cda5f2c4f', deptId: '', endTime: '', knowledgeId: '', majorId: '', mappingColumn: '', startTime: '', studentCourseId: '', studentNameAndNum: '', unitId: '637e13855783d8a848d38a25bded5d2f', version: 'BK_RJGC_2024' }, pageIndex: 1, pageSize: 14, sortField: '', sortWay: '' };
  const r = await (await fetch('/gateway/study/studyRecordExercises/studentPaged', { method: 'POST', headers: H, body: JSON.stringify(body) })).json();
  const d = r.data || {};
  const arr = d.list || d.records || (Array.isArray(d) ? d : []);
  const k = arr[0] || {};
  return JSON.stringify({
    code: r.code, total: d.total, n: arr.length,
    keys: Object.keys(k),
    first: { type: k.questionTypeName, content: String(k.content || k.questionContent || '').slice(0, 60), myAnswer: k.submitAnswer, ref: k.referenceAnswer, score: k.score, gotScore: k.gotScore ?? k.scoreValue, status: k.status, opts: (k.optionVos || []).map((o) => (o.optionContent || '').replace(/<[^>]+>/g, '').slice(0, 12) + '#' + o.answerFlag) },
  }, null, 1);
})()
