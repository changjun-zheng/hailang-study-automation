(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const post = async (u, b) => JSON.parse(await (await fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) })).text());
  const courseId = '4fafa68754ee9872feb67b4cda5f2c4f', studentCourseId = '255b69a5ce54ba7a2c6caa5321b323f7', unitId = '637e13855783d8a848d38a25bded5d2f', videoId = '26eb45aadf79b473f4f5f45545c709ec', studentId = 'YOUR_STUDENT_ID';
  const knId = '92aadfbe-PLACEHOLDER';
  const tree = await post('/gateway/study/courseCatalog/tree', { courseId });
  let subs = [];
  const walk = (n) => { if (n.id === unitId) subs = (n.courseKnowledgeNodeGraphList || []).map((k) => ({ id: k.id, name: k.name })); (n.childList || []).forEach(walk); };
  walk(tree.data);
  const out = [];
  for (const k of subs) {
    const c1 = await post('/gateway/study/studyKnowledgeExerciseRecord/check', { segmentKnowledgeId: k.id, studentCourseId, studentId, videoId });
    const c2 = await post('/gateway/study/studyKnowledgeExerciseRecord/check', { knowledgeNodeId: k.id, studentCourseId, studentId, videoId });
    const lst = await post('/gateway/study/studyKnowledgeExerciseRecord/exercisesList', { knowledgeNodeId: k.id, studentCourseId, unitId, videoId, courseId });
    const arr = Array.isArray(lst.data) ? lst.data : null;
    out.push({ 知识点: k.name, check_segmentKnowledgeId: c1.code + '/' + JSON.stringify(c1.data).slice(0, 30), check_knowledgeNodeId: c2.code + '/' + JSON.stringify(c2.data).slice(0, 30), list: lst.code + '/' + String(lst.msg).slice(0, 24) + (arr ? ' n=' + arr.length : ''), sample: arr && arr[0] ? { type: arr[0].questionType, ref: String(arr[0].referenceAnswer).slice(0, 18), opts: (arr[0].optionVos || []).length } : null });
    if (arr && arr.length) break;
  }
  return JSON.stringify(out, null, 1).slice(0, 2500);
})()
