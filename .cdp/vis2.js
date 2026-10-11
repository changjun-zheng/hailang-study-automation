(() => {
  const hits = [...document.querySelectorAll('*')]
    .filter((e) => { const t = e.innerText || ''; return t.length < 120 && t.includes('软件系统分析与设计'); })
    .map((e) => { const r = e.getBoundingClientRect(); return { tag: e.tagName, cls: (e.className || '').toString().slice(0, 55), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), txt: e.innerText.replace(/\s+/g, ' ').slice(0, 40) }; })
    .filter((o) => o.w > 0 && o.h > 0);
  return JSON.stringify(hits.slice(-4), null, 1);
})()
