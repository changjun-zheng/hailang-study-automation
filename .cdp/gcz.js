(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const out = [];
  const post = async (u, b) => {
    const r = await fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) });
    const ct = r.headers.get('content-type') || '';
    const t = ct.includes('json') ? (await r.text()).slice(0, 150) : '<binary ' + ct + ' ' + (await r.arrayBuffer()).byteLength + 'B>';
    return 'http' + r.status + ' ' + t.replace(/\s+/g, ' ');
  };
  out.push('getCodeZip {}            → ' + (await post('/gateway/file/studyRecordExercises/getCodeZip', {})));
  out.push('getCodeZip 带单元         → ' + (await post('/gateway/file/studyRecordExercises/getCodeZip', { unitId: '637e13855783d8a848d38a25bded5d2f', courseId: '4fafa68754ee9872feb67b4cda5f2c4f', studentCourseId: '255b69a5ce54ba7a2c6caa5321b323f7', version: 'BK_RJGC_2024' })));
  out.push('exercisesResourcePaged  → ' + (await post('/gateway/study/courseCatalogExercises/exercisesResourcePaged', { filters: { courseId: '4fafa68754ee9872feb67b4cda5f2c4f', unitId: '637e13855783d8a848d38a25bded5d2f', studentNum: 'YOUR_STUDENT_ID', studentCourseId: '255b69a5ce54ba7a2c6caa5321b323f7', version: 'BK_RJGC_2024' }, pageIndex: 1, pageSize: 5 })));
  return out.join('\n');
})()
