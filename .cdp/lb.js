(async () => {
  const H = { Authorization: localStorage.getItem('token2') };
  const g = async (u) => await (await fetch(u, { headers: H })).text();
  const out = {};
  for (const cid of ['217f52f41a9a59ef6b06b8cacef0303d', '4fafa68754ee9872feb67b4cda5f2c4f']) {
    const sc = cid.startsWith('217f') ? '0dbd460913810f32019f4e8178b35ab4' : '255b69a5ce54ba7a2c6caa5321b323f7';
    const t = await g(`/gateway/system/orgStudent/listCourseBarrier?courseId=${cid}&majorId=9f07cf1e06d0a57957bd6be34efd3930&userId=YOUR_STUDENT_ID&version=BK_RJGC_2024&studentCourseId=${sc}`);
    out[cid.slice(0, 8)] = t.slice(0, 260).replace(/\s+/g, ' ');
  }
  return JSON.stringify(out, null, 1);
})()
