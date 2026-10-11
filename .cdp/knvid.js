(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const post = async (u, b) => JSON.parse(await (await fetch(u, { method: 'POST', headers: H, body: JSON.stringify(b) })).text());
  const tree = await post('/gateway/study/courseCatalog/tree', { courseId: '4fafa68754ee9872feb67b4cda5f2c4f' });
  let subs = [];
  const walk = (n) => { if (n.id === '637e13855783d8a848d38a25bded5d2f') subs = n.courseKnowledgeNodeGraphList || []; (n.childList || []).forEach(walk); };
  walk(tree.data);
  const k = subs[1] || subs[0];
  const withVideo = Object.entries(k).filter(([_, v]) => /video|Video|segment|Segment/i.test(k) || /video|segment/i.test(v === null ? '' : String(typeof v === 'object' ? JSON.stringify(v) : v))).slice(0, 6);
  return JSON.stringify({ name: k.name, allKeys: Object.keys(k), vals: Object.fromEntries(Object.entries(k).map(([a, b]) => [a, typeof b === 'object' ? JSON.stringify(b).slice(0, 200) : String(b).slice(0, 60)])) }, null, 1).slice(0, 2600);
})()
