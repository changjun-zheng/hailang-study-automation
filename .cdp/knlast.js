(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const post = async (b) => { const r = await fetch('/gateway/study/studyKnowledgeExerciseRecord/exercisesList', { method: 'POST', headers: H, body: JSON.stringify(b) }); const t = await r.text(); try { const j = JSON.parse(t); const a = Array.isArray(j.data) ? j.data : null; return 'code' + j.code + '/' + String(j.msg).slice(0, 22) + (a ? ' n=' + a.length : '') + ' ct=' + r.status; } catch (e) { return 'raw ' + t.slice(0, 60); } };
  const nid = '92aadfbed6f4dab37e4f8a8a3f0fdee0', biz = '20240904170630A131', sc = '255b69a5ce54ba7a2c6caa5321b323f7', unit = '637e13855783d8a848d38a25bded5d2f';
  const out = {};
  out.knowledgeNodeId = await post({ knowledgeNodeId: nid, studentCourseId: sc, unitId: unit });
  out.segmentKnowledgeId = await post({ segmentKnowledgeId: nid, studentCourseId: sc, unitId: unit });
  out.id = await post({ id: nid, studentCourseId: sc, unitId: unit });
  out.businessId = await post({ knowledgeNodeId: biz, studentCourseId: sc, unitId: unit });
  out.withVideo = await post({ knowledgeNodeId: nid, studentCourseId: sc, unitId: unit, videoId: '26eb45aadf79b473f4f5f45545c709ec', courseId: '4fafa68754ee9872feb67b4cda5f2c4f', version: 'BK_RJGC_2024' });
  return JSON.stringify(out, null, 1);
})()
