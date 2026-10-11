(async () => {
  const r = await fetch('/gateway/study/courseCatalog/tree', {
    method: 'POST',
    headers: { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ courseId: '4fafa68754ee9872feb67b4cda5f2c4f' }),
  });
  const j = await r.json();
  localStorage.setItem('__treeDump', JSON.stringify(j.data));
  const rows = [];
  const walk = (n, d) => {
    if (!n) return;
    const c = (n.childList || []);
    if (d > 0) rows.push('  '.repeat(d - 1) + (n.sortName || '?') + ' ' + (n.name || '').slice(0, 22) + ' | 视频' + n.videoCount + ' 课件' + n.coursewareCount + ' 测验' + n.examQuestionCount + ' 练习' + n.exerciseCount + ' 任务' + n.taskCount + ' 资源' + n.resourceCount + ' | id=' + n.id);
    c.forEach((k) => walk(k, d + 1));
  };
  walk(j.data, 0);
  return rows.join('\n');
})()
