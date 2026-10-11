(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const d = JSON.parse(await (await fetch('/gateway/study/courseCatalog/tree', { method: 'POST', headers: H, body: JSON.stringify({ courseId: '217f52f41a9a59ef6b06b8cacef0303d' }) })).text());
  const rows = [];
  const walk = (n) => {
    (n.childList || []).forEach((c) => {
      const vids = (c.courseCatalogCoursewares || []).filter(Boolean);
      rows.push({ sort: c.sortName, name: (c.name || '').slice(0, 18), videoCount: c.videoCount, coursewareCount: c.coursewareCount, exerciseCount: c.exerciseCount, id: c.id, hasVidList: vids.length });
      walk(c);
    });
  };
  walk(d.data || {});
  return JSON.stringify({ n: rows.length, rows: rows.slice(0, 14) }, null, 1).slice(0, 2600);
})()
