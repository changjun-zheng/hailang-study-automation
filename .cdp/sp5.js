(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const body = { asc: '', desc: '', filters: { clazzId: '', courseId: '4fafa68754ee9872feb67b4cda5f2c4f', deptId: '', endTime: '', knowledgeId: '', majorId: '', mappingColumn: '', startTime: '', studentCourseId: '', studentNameAndNum: '', unitId: '637e13855783d8a848d38a25bded5d2f', version: 'BK_RJGC_2024' }, pageIndex: 1, pageSize: 14, sortField: '', sortWay: '' };
  const t = await (await fetch('/gateway/study/studyRecordExercises/studentPaged', { method: 'POST', headers: H, body: JSON.stringify(body) })).text();
  let j = null;
  try { j = JSON.parse(t); } catch (e) {}
  const d = j && j.data;
  const shape = (x) => (Array.isArray(x) ? 'Array(' + x.length + ')' : x && typeof x === 'object' ? '{' + Object.keys(x).slice(0, 20).join(',') + '}' : String(x).slice(0, 40));
  return JSON.stringify({ len: t.length, code: j && j.code, msg: j && j.msg, dataType: shape(d), dataKeys: d && !Array.isArray(d) ? Object.keys(d) : null, firstArrItem: d && Array.isArray(d) && d[0] ? JSON.stringify(d[0]).slice(0, 500) : null, rawHead: t.slice(0, 300) }, null, 1);
})()
