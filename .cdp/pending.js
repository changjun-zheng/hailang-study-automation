(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const post = async (u, b) => JSON.parse(await (await fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) })).text());
  const courseId = '217f52f41a9a59ef6b06b8cacef0303d', sc = '0dbd460913810f32019f4e8178b35ab4', version = 'BK_RJGC_2024';
  const list = await post('/gateway/frequent/orgStudentCourse/myExercises', { filters: { courseId, studentId: 'YOUR_STUDENT_ID' }, pageIndex: 1, pageSize: 100 });
  const recs = (list.data && (list.data.list || list.data.records)) || [];
  const pend = recs.filter((r) => r.statusName === '待完成');
  const out = { 全部单元: recs.length, 待完成: pend.length, 名单: pend.map((r) => r.catalogName) };
  if (pend.length) {
    const r = pend[0];
    const base = { studentCourseId: sc, courseId, version, unitId: r.unitId, courseName: '框架程序设计（Java）', catalogName: r.catalogName };
    const chk = await post('/gateway/study/courseCatalogExercisesConfig/checkUpdateExercises', base);
    const lst = await post('/gateway/study/studyRecordExercises/exercisesList', { ...base, readType: '1', submitTime: '', t: String(Date.now()) });
    const arr = Array.isArray(lst.data) ? lst.data : null;
    out.测试 = { 单元: r.catalogName, check: JSON.stringify(chk.data), listCode: lst.code, listMsg: String(lst.msg).slice(0, 30), 题数: arr ? arr.length : null, 首题: arr && arr[0] ? { 型: arr[0].questionType, 干: String(arr[0].content).slice(0, 40), 选项数: (arr[0].optionVos || []).length, 参考答案: String(arr[0].referenceAnswer).slice(0, 20) } : null };
  }
  return JSON.stringify(out, null, 1);
})()
