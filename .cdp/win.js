(async () => {
  const chunks = [...new Set(performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('/stu/assets/') && n.endsWith('.js')).map((n) => n.replace('https://study.cqie.edu.cn', '')))];
  for (const c of chunks) {
    let t = '';
    try { t = await (await fetch(c)).text(); } catch (e) { continue; }
    const i = t.indexOf('exercisesResourcePaged');
    if (i < 0) continue;
    const seg = t.slice(Math.max(0, i - 700), i + 120);
    const keys = new Set();
    for (const m of seg.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g)) keys.add(m[1]);
    return JSON.stringify({ chunk: c, keysInWindow: [...keys], window: seg.slice(-420) }, null, 1).slice(0, 1800);
  }
  return '未在任何分块中找到';
})()
