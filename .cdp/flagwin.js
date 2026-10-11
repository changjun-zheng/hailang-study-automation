(async () => {
  const chunks = [...new Set(performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/stu/assets/') && n.endsWith('.js')).map((n) => n.replace('https://study.cqie.edu.cn', '')))];
  const out = [];
  for (const c of chunks) {
    let t = '';
    try { t = await (await fetch(c)).text(); } catch (e) { continue; }
    let i = -1;
    while ((i = t.indexOf('checkUpdateExercises', i + 1)) > -1) {
      const seg = t.slice(Math.max(0, i - 260), i + 700);
      if (/flag|\.data|then|await/.test(seg)) out.push({ chunk: c.split('/').pop(), at: i, seg });
      if (out.length > 2) break;
    }
    if (out.length > 2) break;
  }
  return JSON.stringify(out, null, 1).slice(0, 3500);
})()
