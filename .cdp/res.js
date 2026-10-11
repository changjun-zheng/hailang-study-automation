(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const call = async (b) => {
    const r = await fetch('/gateway/study/courseCatalogExercises/exercisesResourcePaged', { method: 'POST', headers: H, body: JSON.stringify(b) });
    return (await r.text()).slice(0, 700).replace(/\s+/g, ' ');
  };
  const a = await call({ filters: { courseId: '4fafa68754ee9872feb67b4cda5f2c4f', unitId: '637e13855783d8a848d38a25bded5d2f', studentId: 'YOUR_STUDENT_ID', studentCourseId: '255b69a5ce54ba7a2c6caa5321b323f7', version: 'BK_RJGC_2024' }, pageIndex: 1, pageSize: 10 });
  return a;
})()
