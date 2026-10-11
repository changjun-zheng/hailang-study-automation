(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const post = async (u, b) => {
    const r = await fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) });
    return await r.text();
  };
  const list = JSON.parse(await post('/gateway/frequent/orgStudentCourse/myExercises', { filters: { courseId: '4fafa68754ee9872feb67b4cda5f2c4f', studentId: 'YOUR_STUDENT_ID' }, pageIndex: 1, pageSize: 100 }));
  const recs = (list.data && (list.data.list || list.data.records)) || [];
  const q = recs[0].courseCatalogExercisesConfig.find((x) => x.questionType === 1);
  const det = JSON.parse(await post('/gateway/study/studyRecordQuestionError/questionDetails', { exercisesId: q.exerciseId }));
  const create = [];
  create.push('exercisesId → ' + (await post('/gateway/study/courseCatalogExercises/create', { exercisesId: q.exerciseId })).slice(0, 110));
  create.push('+submitAnswer → ' + (await post('/gateway/study/courseCatalogExercises/create', { exercisesId: q.exerciseId, submitAnswer: 'x' })).slice(0, 110));
  create.push('+unitId → ' + (await post('/gateway/study/courseCatalogExercises/create', { exercisesId: q.exerciseId, submitAnswer: 'x', unitId: recs[0].unitId, courseId: '4fafa68754ee9872feb67b4cda5f2c4f', studentCourseId: '255b69a5ce54ba7a2c6caa5321b323f7' })).slice(0, 110));
  return JSON.stringify({
    软系分题可读: { code: det.code, msg: det.msg, type: det.data && det.data.questionType, opts: det.data && (det.data.optionVos || []).length, correct: det.data && (det.data.optionVos || []).filter((o) => o.answerFlag === 1).map((o) => o.id.slice(0, 8)), refAns: q.referenceAnswer.slice(0, 10) },
    create,
  }, null, 1);
})()
