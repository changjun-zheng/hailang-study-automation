(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const call = async (b) => {
    const r = await fetch('/gateway/study/studyKnowledgeExerciseRecord/exercisesList', { method: 'POST', headers: H, body: JSON.stringify(b) });
    const t = await r.text();
    return t.slice(0, 260).replace(/\s+/g, ' ');
  };
  const base = { courseId: '4fafa68754ee9872feb67b4cda5f2c4f', unitId: '637e13855783d8a848d38a25bded5d2f', studentCourseId: '255b69a5ce54ba7a2c6caa5321b323f7', version: 'BK_RJGC_2024' };
  const out = [];
  out.push('A 只 unitId            → ' + (await call(base)));
  out.push('B +knowledgeId(bizId) → ' + (await call({ ...base, knowledgeId: '20240904170630A130' })));
  out.push('C +knowledgeId(uuid)  → ' + (await call({ ...base, knowledgeId: '4be6fc9442a546de4bda1fe8a215b1a1' })));
  out.push('D 换 catalogId        → ' + (await call({ courseId: base.courseId, catalogId: base.unitId, studentCourseId: base.studentCourseId, version: base.version, knowledgeId: '20240904170630A130' })));
  return out.join('\n');
})()
