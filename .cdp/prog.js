(async () => {
  const H = { Authorization: localStorage.getItem('token2') };
  const g = async (u) => (await (await fetch(u, { headers: H })).json());
  const c = '4fafa68754ee9872feb67b4cda5f2c4f', s = '255b69a5ce54ba7a2c6caa5321b323f7', b = '22b61644d5062d3d19c0dbc144cea40d';
  const pd = await g(`/gateway/system/orgStudent/progressDetails?studentId=YOUR_STUDENT_ID&id=${c}`);
  const bp = await g(`/gateway/system/orgStudent/barrierStudyProgress?barrierId=${b}&studentCourseId=${s}&version=BK_RJGC_2024`);
  const cb = await g(`/gateway/system/orgStudent/listCatalogBarrier?barrierId=${b}&studentCourseId=${s}`);
  return JSON.stringify({
    课程进度: JSON.stringify(pd.data).slice(0, 500),
    关卡进度: bp.data,
    每视频状态: (cb.data || []).map((n) => ({ name: (n.catalogName || '').slice(0, 22), studyVideoStatus: n.studyVideoStatus, catalogStatus: n.catalogStatus, rec: n.studyStudentCatalogCrossRecord ? JSON.stringify(n.studyStudentCatalogCrossRecord).slice(0, 220) : null })),
  }, null, 1);
})()
