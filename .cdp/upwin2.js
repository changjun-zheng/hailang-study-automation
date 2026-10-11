(async () => {
  const chunks = [...new Set(performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/stu/assets/') && n.endsWith('.js')).map((n) => n.replace('https://study.cqie.edu.cn', '')))];
  const hits = [];
  for (const c of chunks) {
    let t = '';
    try { t = await (await fetch(c)).text(); } catch (e) { continue; }
    let i = -1;
    while ((i = t.indexOf('uploadCodeZip', i + 1)) > -1) hits.push({ chunk: c.split('/').pop(), pos: i, seg: t.slice(Math.max(0, i - 500), i + 420) });
  }
  return JSON.stringify({ chunks: chunks.length, hits: hits.length, list: hits }, null, 1).slice(0, 3600);
})()
