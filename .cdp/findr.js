(async () => {
  const chunks = ['assets/index.416ff6d1.js', 'assets/page.a428e852.js', 'assets/index.fd04d2e9.js'];
  const all = new Set();
  for (const c of chunks) {
    let t = '';
    try { t = await (await fetch('/stu/' + c)).text(); } catch (e) { continue; }
    for (const m of t.matchAll(/["'`]([/A-Za-z0-9_-]*studyRecordExercises[/A-Za-z0-9_-]*)["'`]/g)) all.add(m[1]);
    for (const m of t.matchAll(/["'`](\/gateway[A-Za-z0-9_/.-]*[Ee]xercise[A-Za-z0-9_/.-]*)["'`]/g)) all.add(m[1]);
  }
  return [...all].join('\n') || '未匹配到 exercise 相关路径';
})()
