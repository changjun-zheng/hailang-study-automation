(() => {
  const app = document.querySelector('#app').__vue_app__;
  const r = app && app.config && app.config.globalProperties && app.config.globalProperties.$router;
  const routes = r ? r.getRoutes().map((x) => x.path).slice(0, 60) : [];
  const el = [...document.querySelectorAll('.itemContent')].find((e) => (e.innerText || '').includes('软件系统分析与设计'));
  let props = null;
  if (el) {
    let c = el.__vueParentComponent;
    for (let i = 0; i < 6 && c && !props; i++) {
      const d = c.props || c.data;
      if (d && typeof d === 'object') {
        const o = {};
        Object.keys(d).slice(0, 14).forEach((k) => {
          const v = d[k];
          o[k] = v && typeof v === 'object' ? '{' + Object.keys(v).slice(0, 14).join(',') + '}' : String(v).slice(0, 40);
        });
        if (Object.keys(o).length) props = o;
      }
      c = c.parent;
    }
  }
  return JSON.stringify({ routes, props }, null, 1);
})()
