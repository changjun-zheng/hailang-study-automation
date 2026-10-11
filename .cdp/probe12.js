(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const call = async (u, b) => {
    const r = await fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) });
    const t = await r.text();
    return t.slice(0, 220).replace(/\s+/g, ' ');
  };
  const out = [];
  for (const n of ['check', 'exercisesList']) {
    out.push('--- knowledgeExerciseRecord/' + n + ' {}');
    out.push('  ' + (await call('/gateway/study/studyKnowledgeExerciseRecord/' + n, {})));
  }
  out.push('--- knowledgeExerciseRecord/exercisesList 带参数');
  out.push('  ' + (await call('/gateway/study/studyKnowledgeExerciseRecord/exercisesList', { courseId: '4fafa68754ee9872feb67b4cda5f2c4f', unitId: '637e13855783d8a848d38a25bded5d2f', studentCourseId: '255b69a5ce54ba7a2c6caa5321b323f7', version: 'BK_RJGC_2024', knowledgeId: '' })));
  out.push('--- taskRecordExercises/details {}');
  out.push('  ' + (await call('/gateway/study/taskRecordExercises/details', {})));
  out.push('--- codeRun/submitCode {}');
  out.push('  ' + (await call('/gateway/code/codeRun/submitCode', {})));
  return out.join('\n');
})()
