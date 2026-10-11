(async () => {
  const chunks = [...new Set(performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/stu/assets/') && n.endsWith('.js')).map((n) => n.replace('https://study.cqie.edu.cn', '')))];
  const out = [];
  for (const c of chunks) {
    let t = '';
    try { t = await (await fetch(c)).text(); } catch (e) { continue; }
    let i = -1, n = 0;
    while ((i = t.indexOf('uploadCodeZip', i + 1)) > -1 && n < 3) {
      const seg = t.slice(Math.max(0, i - 700), i + 300);
      if (!/:\s*"file\//.test(seg.slice(660))) out.push({ chunk: c.split('/').pop(), seg });
      n++;
    }
  }
  return JSON.stringify({ hits: out.length, out: out.slice(0, 2) }, null, 1).slice(0, 3000);
})()
