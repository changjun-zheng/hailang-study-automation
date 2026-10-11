(async () => {
  const chunks = [...new Set(performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/stu/assets/') && n.endsWith('.js')).map((n) => n.replace('https://study.cqie.edu.cn', '')))];
  const want = ['studyKnowledgeExerciseRecord', 'studyKnowledgeExerciseSummaryRecord', 'taskRecordExercises', 'courseExamQuestion', 'courseCatalogExercises', 'studyOfficeExercises', 'review'];
  const found = {};
  for (const c of chunks) {
    let t = '';
    try { t = await (await fetch(c)).text(); } catch (e) { continue; }
    for (const w of want) {
      found[w] = found[w] || new Set();
      for (const m of t.matchAll(new RegExp('["\'`]([/A-Za-z0-9_-]*' + w + '[A-Za-z0-9_/-]*)["\'`]', 'g'))) found[w].add(m[1]);
    }
  }
  return Object.entries(found).map(([k, v]) => k + ':\n  ' + [...v].sort().join('\n  ')).join('\n\n');
})()
