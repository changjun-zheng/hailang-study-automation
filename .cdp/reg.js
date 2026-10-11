(async () => {
  const t = await (await fetch('/stu/assets/index.fd04d2e9.js')).text();
  const keys = ['recordExercisesCreateList','studyRecordExercisesCreateCheckList','createExercisesList','deleteRecordExercises','clearExeStudentUnit','exercisesList','studentPaged','submitExeAnswer','saveExeAnswer','commitExe','exercisesCommit','saveReviewExercises'];
  const out = {};
  for (const k of keys) {
    const m = t.match(new RegExp('[,"{]' + k + '\s*:\s*"([^"]+)"'));
    out[k] = m ? m[1] : '(未找到)';
  }
  return JSON.stringify(out, null, 1);
})()
