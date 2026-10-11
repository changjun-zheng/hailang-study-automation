(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const call = async (u, b) => {
    const r = await fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) });
    const t = await r.text();
    return 'http' + r.status + ' ' + t.slice(0, 200).replace(/\s+/g, ' ');
  };
  const out = [];
  for (const n of ['answerList', 'sysQuestionAnswerList', 'answerSend', 'robotAnswerSend']) {
    out.push('--- orgStudyQuestion/' + n);
    out.push('  {}            → ' + (await call('/gateway/study/orgStudyQuestion/' + n, {})));
    out.push('  带课程单元     → ' + (await call('/gateway/study/orgStudyQuestion/' + n, { courseId: '4fafa68754ee9872feb67b4cda5f2c4f', unitId: '637e13855783d8a848d38a25bded5d2f', studentCourseId: '255b69a5ce54ba7a2c6caa5321b323f7', version: 'BK_RJGC_2024', exercisesId: 'x' })));
  }
  out.push('--- studyOfficeExercises/save {} → ' + (await call('/gateway/study/studyOfficeExercises/save', {})));
  return out.join('\n');
})()
