(() => {
  const app = document.querySelector('#app').__vue_app__;
  const pinia = app.config.globalProperties.$pinia;
  const out = {};
  const st = (pinia && pinia.state && pinia.state.value) || {};
  Object.keys(st).forEach((k) => {
    const s = st[k];
    const brief = {};
    Object.keys(s).slice(0, 25).forEach((kk) => {
      const v = s[kk];
      if (Array.isArray(v)) brief[kk] = 'Array(' + v.length + ')';
      else if (v && typeof v === 'object') brief[kk] = '{' + Object.keys(v).slice(0, 10).join(',') + '}';
      else brief[kk] = String(v).slice(0, 30);
    });
    out[k] = brief;
  });
  return JSON.stringify(out, null, 1);
})()
