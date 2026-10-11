(async () => {
  const H = { Authorization: localStorage.getItem('token2') };
  const g = async (u) => JSON.parse(await (await fetch(u, { headers: H })).text());
  const base = 'studentId=YOUR_STUDENT_ID&id=217f52f41a9a59ef6b06b8cacef0303d&majorId=9f07cf1e06d0a57957bd6be34efd3930&studentCourseId=0dbd460913810f32019f4e8178b35ab4&version=BK_RJGC_2024';
  const d = await g('/gateway/system/orgStudent/myCourseDetails?' + base);
  const p = await g('/gateway/system/orgStudent/progressDetails?' + base);
  const shape = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, Array.isArray(v) ? 'Array(' + v.length + ')' + (v[0] && typeof v[0] === 'object' ? '{' + Object.keys(v[0]).slice(0, 10).join(',') + '}' : '') : v && typeof v === 'object' ? '{' + Object.keys(v).slice(0, 10).join(',') + '}' : String(v).slice(0, 40)]));
  return JSON.stringify({ details: shape(d.data), progress: shape(p.data) }, null, 1).slice(0, 3000);
})()
