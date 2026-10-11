(() => {
  const items = [...document.querySelectorAll('.item')].filter((e) => (e.innerText || '').includes('软件系统分析与设计'));
  const el = items[items.length - 1];
  if (!el) return 'none';
  const kids = [...el.querySelectorAll('*')].map((k) => { const r = k.getBoundingClientRect(); return k.tagName + '.' + (k.className || '').toString().split(' ')[0] + (r.width ? '[' + Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.width) + 'x' + Math.round(r.height) + ']' : '[0]'); });
  return JSON.stringify({ outer: el.outerHTML.slice(0, 700), kids: kids.slice(0, 30) }, null, 1);
})()
