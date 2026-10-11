(() => {
  const el = [...document.querySelectorAll('.itemContent')].find((e) => (e.innerText || '').includes('软件系统分析与设计'));
  if (!el) return 'notfound';
  const chain = [];
  let n = el;
  for (let i = 0; i < 6 && n; i++) {
    const comp = n.__vueParentComponent;
    const vp = comp && comp.vnode && comp.vnode.props ? Object.keys(comp.vnode.props) : [];
    const own = [];
    if (comp && comp.ctx) Object.keys(comp.ctx).slice(0, 40).forEach((k) => { if (typeof comp.ctx[k] === 'function') own.push(k); });
    chain.push({
      i,
      tag: n.tagName,
      cls: (n.className || '').toString().slice(0, 50),
      hasComp: !!comp,
      compName: comp && comp.type && (comp.type.name || comp.type.__name) || '',
      vnodeProps: vp.slice(0, 12),
      ctxFns: own.slice(0, 18),
    });
    n = n.parentElement;
  }
  return JSON.stringify(chain, null, 1);
})()
