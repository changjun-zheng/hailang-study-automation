(async () => {
  const r = await fetch('/gateway/study/courseCatalog/tree', {
    method: 'POST',
    headers: { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ courseId: '4fafa68754ee9872feb67b4cda5f2c4f' }),
  });
  const j = await r.json();
  const walk = (nodes, depth) => (nodes || []).map((n) => ({
    d: depth,
    name: (n.name || n.title || '').slice(0, 26),
    type: n.nodeType ?? n.type ?? n.catalogType ?? '',
    kinds: Object.keys(n).filter((k) => /type|kind|category|resource|video|exam|practice|lab|task/i.test(k)).slice(0, 8).map((k) => k + '=' + (typeof n[k] === 'object' ? '{' + Object.keys(n[k] || {}).slice(0, 5).join('|') + '}' : String(n[k]).slice(0, 18))),
    kids: n.children ? walk(n.children, depth + 1) : undefined,
  }));
  const root = j.data && (j.data.records || j.data.tree || j.data.children || j.data);
  const tree = Array.isArray(root) ? walk(root, 0) : { keys: Object.keys(j.data || {}), sample: JSON.stringify(j.data).slice(0, 900) };
  return JSON.stringify(tree, null, 1).slice(0, 6000);
})()
