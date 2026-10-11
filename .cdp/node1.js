(async () => {
  const H = { Authorization: localStorage.getItem('token2') };
  const r = await (await fetch('/gateway/system/orgStudent/listCatalogBarrier?barrierId=22b61644d5062d3d19c0dbc144cea40d&studentCourseId=255b69a5ce54ba7a2c6caa5321b323f7', { headers: H })).json();
  const n0 = r.data[0];
  const shape = (x) => (Array.isArray(x) ? 'Array(' + x.length + ')' : x === null ? 'null' : typeof x);
  return JSON.stringify({
    topN: r.data.length,
    keys: Object.keys(n0),
    shapes: Object.fromEntries(Object.keys(n0).map((k) => [k, shape(n0[k])])),
    childrenN: (n0.children || []).length,
    child0: JSON.stringify((n0.children || [])[0] || {}).slice(0, 1200),
    vids: JSON.stringify(n0.courseCatalogVideoVos || []).slice(0, 600),
  }, null, 1);
})()
