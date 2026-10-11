(async () => {
  const H = { Authorization: localStorage.getItem('token2') };
  const g = async (u) => JSON.parse(await (await fetch(u, { headers: H })).text());
  const d = await g('/gateway/system/sysUser/nowUserDetails');
  const x = d.data || {};
  const flags = Object.entries(x).filter(([k]) => /email|Email|phone|mobile|bind|Bind|active|status|Status|realName|audit/i.test(k)).map(([k, v]) => k + '=' + (v === null ? 'null' : typeof v === 'object' ? JSON.stringify(v).slice(0, 40) : String(v).slice(0, 30)));
  return JSON.stringify({ code: d.code, allKeys: Object.keys(x).length, flags }, null, 1);
})()
