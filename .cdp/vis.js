(() => {
  const hits = [...document.querySelectorAll('*')]
    .filter((e) => {
      const t = e.innerText || '';
      return t.length < 60 && t.includes('软件系统分析与设计');
    })
    .map((e) => {
      const r = e.getBoundingClientRect();
      return { tag: e.tagName, cls: (e.className || '').toString().slice(0, 60), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), vis: getComputedStyle(e).visibility, txt: e.innerText.replace(/\s+/g, ' ').slice(0, 30) };
    });
  return JSON.stringify(hits, null, 1);
})()
