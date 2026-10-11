(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const bodies = [
    { filters: { courseId: '4fafa68754ee9872feb67b4cda5f2c4f', studentId: 'YOUR_STUDENT_ID' }, pageIndex: 1, pageSize: 5 },
    { filters: { studentCourseId: '255b69a5ce54ba7a2c6caa5321b323f7', unitId: '637e13855783d8a848d38a25bded5d2f' }, pageIndex: 1, pageSize: 5 },
    { filters: { courseId: '4fafa68754ee9872feb67b4cda5f2c4f', studentCourseId: '255b69a5ce54ba7a2c6caa5321b323f7', unitId: '637e13855783d8a848d38a25bded5d2f', version: 'BK_RJGC_2024' }, pageIndex: 1, pageSize: 5 },
  ];
  const out = [];
  for (const b of bodies) {
    const r = await (await fetch('/gateway/study/studyRecordExercises/studentPaged', { method: 'POST', headers: H, body: JSON.stringify(b) })).json();
    const arr = r.data && (r.data.list || r.data.records) || (Array.isArray(r.data) ? r.data : null);
    out.push({ keys: Object.keys(b.filters).join(','), code: r.code, msg: String(r.msg).slice(0, 30), n: arr ? arr.length : null, sample: arr && arr[0] ? JSON.stringify(arr[0]).slice(0, 700) : null });
    if (arr && arr.length) break;
  }
  return JSON.stringify(out, null, 1);
})()
