(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const flt = { courseId: '4fafa68754ee9872feb67b4cda5f2c4f', unitId: '637e13855783d8a848d38a25bded5d2f', version: 'BK_RJGC_2024' };
  const variants = [
    { studentNum: 'YOUR_STUDENT_ID', filters: flt, pageIndex: 1, pageSize: 10 },
    { studentId: 'YOUR_STUDENT_ID', filters: flt, pageIndex: 1, pageSize: 10 },
    { filters: { ...flt, studentNum: 'YOUR_STUDENT_ID', studentCourseId: '255b69a5ce54ba7a2c6caa5321b323f7' }, pageIndex: 1, pageSize: 10, studentNum: 'YOUR_STUDENT_ID' },
  ];
  const out = [];
  for (const b of variants) {
    const t = await (await fetch('/gateway/study/courseCatalogExercises/exercisesResourcePaged', { method: 'POST', headers: H, body: JSON.stringify(b) })).text();
    out.push(Object.keys(b).join(',') + ' | filters:' + Object.keys(b.filters).join(',') + '\n  → ' + t.slice(0, 400).replace(/\s+/g, ' '));
  }
  return out.join('\n\n');
})()
