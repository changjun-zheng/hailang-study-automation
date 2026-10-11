(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const f = { courseId: '4fafa68754ee9872feb67b4cda5f2c4f', unitId: '637e13855783d8a848d38a25bded5d2f', studentId: 'YOUR_STUDENT_ID', studentNum: 'YOUR_STUDENT_ID', studentCourseId: '255b69a5ce54ba7a2c6caa5321b323f7', version: 'BK_RJGC_2024', clazzId: 'e95fd6aad66f3ed4631c906d0160049b' };
  const r = await fetch('/gateway/study/courseCatalogExercises/exercisesResourcePaged', { method: 'POST', headers: H, body: JSON.stringify({ filters: f, pageIndex: 1, pageSize: 10 }) });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (e) {}
  if (!j) return 'non-json: ' + t.slice(0, 200);
  const arr = j.data && (j.data.list || j.data.records) || [];
  return JSON.stringify({ code: j.code, msg: j.msg, n: arr.length, first: arr[0] ? Object.fromEntries(Object.entries(arr[0]).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v).slice(0, 120) : String(v).slice(0, 120)])) : null }, null, 1).slice(0, 2200);
})()
