(async () => {
  const H = { Authorization: localStorage.getItem('token2') };
  const g = async (u) => JSON.parse(await (await fetch(u, { headers: H })).text());
  const bs = await g('/gateway/system/orgStudent/listCourseBarrier?courseId=4fafa68754ee9872feb67b4cda5f2c4f&majorId=9f07cf1e06d0a57957bd6be34efd3930&userId=YOUR_STUDENT_ID&version=BK_RJGC_2024&studentCourseId=255b69a5ce54ba7a2c6caa5321b323f7');
  const rows = [];
  for (const b of (bs.data || []).sort((x, y) => (x.sortCode || 0) - (y.sortCode || 0))) {
    const vids = (await g(`/gateway/system/orgStudent/listCatalogBarrier?barrierId=${b.id}&studentCourseId=255b69a5ce54ba7a2c6caa5321b323f7`)).data || [];
    const p = (await g(`/gateway/system/orgStudent/barrierStudyProgress?barrierId=${b.id}&studentCourseId=255b69a5ce54ba7a2c6caa5321b323f7&version=BK_RJGC_2024`)).data || {};
    rows.push({
      关卡: b.name,
      视频: vids.length,
      服务端已学: p.haveLearned,
      未学: p.unlearned,
      未学清单: vids.filter((v) => v.studyVideoStatus === 0).map((v) => (v.catalogName || '').slice(0, 26)),
    });
  }
  return JSON.stringify(rows, null, 1);
})()
