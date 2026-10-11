(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const body = { asc: '', desc: '', filters: { clazzId: '', courseId: '4fafa68754ee9872feb67b4cda5f2c4f', deptId: '', endTime: '', knowledgeId: '', majorId: '', mappingColumn: '', startTime: '', studentCourseId: '', studentNameAndNum: '', unitId: '637e13855783d8a848d38a25bded5d2f', version: 'BK_RJGC_2024' }, pageIndex: 1, pageSize: 14, sortField: '', sortWay: '' };
  const j = await (await fetch('/gateway/study/studyRecordExercises/studentPaged', { method: 'POST', headers: H, body: JSON.stringify(body) })).json();
  const d = j.data || {};
  const shape = {};
  Object.keys(d).forEach((k) => {
    const v = d[k];
    if (Array.isArray(v)) shape[k] = 'Array(' + v.length + ')' + (v[0] && typeof v[0] === 'object' ? ' item{' + Object.keys(v[0]).slice(0, 14).join(',') + '}' : '');
    else if (v && typeof v === 'object') shape[k] = '{' + Object.keys(v).slice(0, 14).join(',') + '}';
    else shape[k] = String(v).slice(0, 40);
  });
  return JSON.stringify(shape, null, 1);
})()
