(async () => {
  const t = localStorage.getItem('token2') || '';
  const url = '/gateway/frequent/orgStudent/pagedMyCourse';
  const tries = [
    { m: 'GET', q: '?pageNum=1&pageSize=20', h: { Authorization: t } },
    { m: 'GET', q: '?pageNum=1&pageSize=20', h: { Authorization: 'Bearer ' + t } },
    { m: 'GET', q: '?current=1&size=20', h: { Authorization: t } },
    { m: 'POST', q: '', h: { Authorization: t, 'Content-Type': 'application/json' }, b: JSON.stringify({ pageNum: 1, pageSize: 20 }) },
  ];
  const out = [];
  for (const tr of tries) {
    try {
      const r = await fetch(url + tr.q, { method: tr.m, headers: tr.h, body: tr.b });
      const txt = await r.text();
      let brief = txt.slice(0, 120);
      try { const j = JSON.parse(txt); const arr = j.data && (j.data.records || j.data.list || j.data); brief = Array.isArray(arr) ? 'OK n=' + arr.length + ' keys=' + Object.keys(arr[0] || {}).slice(0, 12).join(',') : 'code=' + (j.code ?? j.status) + ' msg=' + String(j.msg ?? j.message ?? '').slice(0, 40); } catch (e) {}
      out.push(tr.m + ' ' + tr.q + ' -> ' + r.status + ' | ' + brief);
      if (r.status === 200 && brief.startsWith('OK')) {
        const j = JSON.parse(txt);
        const arr = j.data.records || j.data.list || j.data;
        window.__courses = arr;
        out.push('COURSES=' + JSON.stringify(arr.map((c) => ({ id: c.id || c.courseId, name: (c.courseName || c.name || '').slice(0, 20) }))));
        break;
      }
    } catch (e) {
      out.push(tr.m + ' ' + tr.q + ' ERR ' + String(e).slice(0, 60));
    }
  }
  return JSON.stringify(out, null, 1);
})()
