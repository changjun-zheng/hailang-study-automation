(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const r = await (await fetch('/gateway/frequent/studentWorkstation/myLevelCourseList', { method: 'POST', headers: H, body: '{}' })).json();
  const list = (r.data && (r.data.list || r.data.records)) || r.data || [];
  return JSON.stringify({ code: r.code, n: Array.isArray(list) ? list.length : typeof list, items: (Array.isArray(list) ? list : []).map((x) => Object.fromEntries(Object.entries(x).filter(([k, v]) => /name|learned|progress|sum|have|unit|barrier|score/i.test(k) && (typeof v !== 'object' || v === null)).map(([k, v]) => [k, String(v).slice(0, 26)]))) }).slice(0, 2400);
})()
