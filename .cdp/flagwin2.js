(async () => {
  const chunks = [...new Set(performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/stu/assets/') && n.endsWith('.js')).map((n) => n.replace('https://study.cqie.edu.cn', '')))];
  const out = [];
  for (const c of chunks) {
    let t = '';
    try { t = await (await fetch(c)).text(); } catch (e) { continue; }
    let i = -1, n = 0;
    while ((i = t.indexOf('checkUpdateExercises', i + 1)) > -1 && n < 3) {
      out.push({ chunk: c.split('/').pop(), pos: i, win: t.slice(Math.max(0, i - 200), i + 620) });
      n++;
    }
  }
  return JSON.stringify({ chunks: chunks.length, hits: out.length, out }, null, 1).slice(0, 3800);
})()
