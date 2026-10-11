(async () => {
  const H = { Authorization: localStorage.getItem('token2') };
  const r = await (await fetch('/gateway/system/orgStudent/listCatalogBarrier?barrierId=22b61644d5062d3d19c0dbc144cea40d&studentCourseId=255b69a5ce54ba7a2c6caa5321b323f7', { headers: H })).json();
  return JSON.stringify(r.data, null, 1).slice(0, 3000);
})()
