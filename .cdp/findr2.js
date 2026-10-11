(async () => {
  const chunks = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.endsWith('.js') && n.includes('/stu/assets/')).map((n) => n.replace('https://study.cqie.edu.cn', ''));
  const hits = new Set();
  for (const c of chunks) {
    let t = '';
    try { t = await (await fetch(c)).text(); } catch (e) { continue; }
    for (const m of t.matchAll(/["'`]([/A-Za-z0-9_-]*(?:submit|Submit|answer|Answer|correct|Correct|save|Save)[/A-Za-z0-9_-]*)["'`]/g)) {
      const p = m[1];
      if (p.includes('/') && !/\.(png|svg|css|js)$/.test(p) && p.length < 60) hits.add(p);
    }
  }
  return 'chunks=' + chunks.length + '\n' + [...hits].slice(0, 60).join('\n');
})()
