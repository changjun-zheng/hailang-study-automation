(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const post = async (u, b) => JSON.parse(await (await fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) })).text());
  const courseId = '4fafa68754ee9872feb67b4cda5f2c4f', studentCourseId = '255b69a5ce54ba7a2c6caa5321b323f7', unitId = '637e13855783d8a848d38a25bded5d2f';
  const tree = await post('/gateway/study/courseCatalog/tree', { courseId });
  const kns = [];
  const walk = (n) => { if (n.id === unitId) (n.courseKnowledgeNodeGraphList || []).forEach((k) => kns.push({ id: k.id, businessId: k.businessId, name: k.name })); (n.childList || []).forEach(walk); };
  walk(tree.data);
  const out = { 知识点: kns.map((k) => k.name + '|' + k.id.slice(0, 8)), tries: [] };
  for (const k of kns) {
    for (const key of ['id', 'businessId']) {
      const nid = k[key];
      const chk = await post('/gateway/study/courseCatalogKnowledgeExercise/checkUpdateExercises', { knowledgeNodeId: nid, studentCourseId, unitId });
      const lst = await post('/gateway/study/studyKnowledgeExerciseRecord/exercisesList', { knowledgeNodeId: nid, studentCourseId, unitId });
      const arr = Array.isArray(lst.data) ? lst.data : null;
      out.tries.push({ kn: k.name, key, checkCode: chk.code, checkData: JSON.stringify(chk.data).slice(0, 40), listCode: lst.code, listMsg: String(lst.msg).slice(0, 26), n: arr ? arr.length : null, sample: arr && arr[0] ? { type: arr[0].questionType, content: String(arr[0].content).slice(0, 30), ref: String(arr[0].referenceAnswer).slice(0, 20), opts: (arr[0].optionVos || []).length, submit: arr[0].submitAnswer } : null });
      if (arr && arr.length) break;
    }
    if (out.tries.some((t) => t.n)) break;
  }
  return JSON.stringify(out, null, 1).slice(0, 3000);
})()
