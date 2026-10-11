(async () => {
  const chunks = [...new Set(performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/stu/assets/') && n.endsWith('.js')).map((n) => n.replace('https://study.cqie.edu.cn', '')))];
  const out = [];
  for (const c of chunks) {
    let t = '';
    try { t = await (await fetch(c)).text(); } catch (e) { continue; }
    for (const needle of ['getStudyKnowledgeExerciseRecordExercisesList', 'checkStudyKnowledgeExerciseRecord', 'checkKnowledgeUpdateExercises']) {
      let i = -1, n = 0;
      while ((i = t.indexOf(needle, i + 1)) > -1 && n < 2) {
        const seg = t.slice(Math.max(0, i - 60), i + 560);
        if (/\(/.test(seg.slice(60, 130))) out.push({ chunk: c.split('/').pop(), needle, win: seg });
        n++;
      }
    }
  }
  return JSON.stringify({ chunks: chunks.length, hits: out.length, out: out.slice(0, 4) }, null, 1).slice(0, 3600);
})()
