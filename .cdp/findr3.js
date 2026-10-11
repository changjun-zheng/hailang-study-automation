(async () => {
  const chunks = [...new Set(performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/stu/assets/') && n.endsWith('.js')).map((n) => n.replace('https://study.cqie.edu.cn', '')))];
  const ex = new Set();
  const controllers = new Set();
  for (const c of chunks) {
    let t = '';
    try { t = await (await fetch(c)).text(); } catch (e) { continue; }
    for (const m of t.matchAll(/["'`]([/A-Za-z0-9_-]*studyRecordExercises[A-Za-z0-9_/-]*)["'`]/g)) ex.add(m[1]);
    for (const m of t.matchAll(/["'`](study\/[a-zA-Z]+)\//g)) controllers.add(m[1]);
  }
  return 'chunks=' + chunks.length + '\n== studyRecordExercises 全部路径 ==\n' + [...ex].sort().join('\n') + '\n\n== study/ 下出现过的控制器 ==\n' + [...controllers].sort().join(', ');
})()
