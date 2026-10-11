(async () => {
  const H = { Authorization: localStorage.getItem('token2') };
  const g = async (u) => JSON.parse(await (await fetch(u, { headers: H })).text());
  const bs = await g('/gateway/system/orgStudent/listCourseBarrier?courseId=4fafa68754ee9872feb67b4cda5f2c4f&majorId=9f07cf1e06d0a57957bd6be34efd3930&userId=YOUR_STUDENT_ID&version=BK_RJGC_2024&studentCourseId=255b69a5ce54ba7a2c6caa5321b323f7');
  const rows = [];
  for (const b of (bs.data || []).sort((x, y) => (x.sortCode || 0) - (y.sortCode || 0))) {
    const nodes = (await g(`/gateway/system/orgStudent/listCatalogBarrier?barrierId=${b.id}&studentCourseId=255b69a5ce54ba7a2c6caa5321b323f7`)).data || [];
    const p = (await g(`/gateway/system/orgStudent/barrierStudyProgress?barrierId=${b.id}&studentCourseId=255b69a5ce54ba7a2c6caa5321b323f7&version=BK_RJGC_2024`)).data || {};
    rows.push({ 关卡: b.name, 视频已学: p.haveLearned + '/' + nodes.length, 练习待做: p.unpracticed, 练习已做: p.havepracticed, 未通过练习: p.unpassExercises, 未通过测验: p.unpassExam, 单元练习状态: [...new Set(nodes.map((n) => 'ex' + n.studyExerciseStatus))] });
  }
  return JSON.stringify(rows, null, 1);
})()
