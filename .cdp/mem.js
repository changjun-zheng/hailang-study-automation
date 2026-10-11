(() => {
  const app = document.querySelector('#app').__vue_app__;
  const seen = new Set();
  const found = [];
  const walk = (inst, depth) => {
    if (!inst || depth > 14 || seen.has(inst)) return;
    seen.add(inst);
    const bags = [inst.setupState, inst.data, inst.props];
    for (const b of bags) {
      if (!b || typeof b !== 'object') continue;
      for (const k of Object.keys(b)) {
        let v;
        try { v = b[k]; } catch (e) { continue; }
        if (v && typeof v.length === 'number' && v.length > 20 && Array.isArray(v)) {
          const s = v[0];
          if (s && typeof s === 'object') found.push({ key: k, n: v.length, fields: Object.keys(s).slice(0, 16) });
        }
      }
    }
    const kids = inst.subTree ? [] : [];
    if (inst.subTree && inst.subTree.component) walk(inst.subTree.component, depth + 1);
    const sib = inst.vnode && inst.vnode.dynamicChildren ? inst.vnode.dynamicChildren : [];
    for (const c of sib.slice(0, 25)) { if (c && c.component) walk(c.component, depth + 1); }
    if (inst.refs) for (const k of Object.keys(inst.refs)) { const r = inst.refs[k]; if (r && r.subTree && r.subTree.component) walk(r.subTree.component, depth + 1); }
  };
  walk(app._instance, 0);
  return JSON.stringify({ visitedComponents: seen.size, arrays: found.slice(0, 10) }, null, 1);
})()
