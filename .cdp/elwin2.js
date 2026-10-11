(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const q = {
    studentCourseId: '255b69a5ce54ba7a2c6caa5321b323f7',
    courseId: '4fafa68754ee9872feb67b4cda5f2c4f',
    version: 'BK_RJGC_2024',
    unitId: '637e13855783d8a848d38a25bded5d2f',
    courseName: '软件系统分析与设计',
    catalogName: '需求收集与整理',
    submitTime: '',
    readType: '1',
    t: String(Date.now()),
  };
  const r = await fetch('/gateway/study/studyRecordExercises/exercisesList', { method: 'POST', headers: H, body: JSON.stringify(q) });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (e) {}
  if (!j) return 'non-json ' + t.slice(0, 200);
  const arr = Array.isArray(j.data) ? j.data : null;
  return JSON.stringify({
    code: j.code, msg: j.msg, isArray: !!arr, n: arr ? arr.length : null,
    first: arr && arr[0] ? { catalogName: arr[0].catalogName, qType: arr[0].questionType, score: arr[0].questionScore, content: String(arr[0].content).slice(0, 50), opts: (arr[0].optionVos || []).map((o) => o.id.slice(0, 8) + ':' + String(o.optionContent).replace(/<[^>]+>/g, '').slice(0, 10) + ':flag' + o.answerFlag), submit: arr[0].submitAnswer, st: arr[0].studyExerciseStatus } : String(t).slice(0, 300),
  }, null, 1).slice(0, 2000);
})()
