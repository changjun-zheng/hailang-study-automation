(async () => {
  const H = { Authorization: localStorage.getItem('token2') };
  const d = JSON.parse(await (await fetch('/gateway/system/orgStudent/myCourseDetails?studentId=YOUR_STUDENT_ID&id=217f52f41a9a59ef6b06b8cacef0303d&majorId=9f07cf1e06d0a57957bd6be34efd3930&studentCourseId=0dbd460913810f32019f4e8178b35ab4&version=BK_RJGC_2024', { headers: H })).text());
  const x = d.data || {};
  const arrs = Object.entries(x).filter(([, v]) => Array.isArray(v) && v.length).map(([k, v]) => ({ key: k, n: v.length, item0: JSON.stringify(v[0]).slice(0, 420) }));
  return JSON.stringify(arrs, null, 1).slice(0, 3200);
})()
