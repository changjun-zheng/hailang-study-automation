(async () => {
  const H = { Authorization: localStorage.getItem('token2') };
  const b = '22b61644d5062d3d19c0dbc144cea40d', sc = '255b69a5ce54ba7a2c6caa5321b323f7';
  const t = await (await fetch(`/gateway/system/orgStudent/listCatalogBarrier?barrierId=${b}&studentCourseId=${sc}`, { headers: H })).json();
  const p = await (await fetch(`/gateway/system/orgStudent/barrierStudyProgress?barrierId=${b}&studentCourseId=${sc}&version=BK_RJGC_2024`, { headers: H })).json();
  const flat = (n, d) => (n || []).map((x) => ({ d, name: (x.name || '').slice(0, 20), id: x.id, keys: Object.keys(x).filter((k) => !['childList','createTime','updateTime','createBy','updateBy','courseId','sortName'].includes(k)).slice(0, 12), kids: x.childList ? flat(x.childList, d + 1) : undefined }));
  return JSON.stringify({ treeTopKeys: Object.keys(t.data || {}), tree: flat(t.data && (t.data.childList || t.data.records || t.data), 0).slice(0, 8), progress: JSON.stringify(p.data).slice(0, 900) }, null, 1).slice(0, 4500);
})()
