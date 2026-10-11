(() => {
  const hits = [...document.querySelectorAll('a,[class*="card"],[class*="item"],[class*="course"]')]
    .filter((e) => (e.innerText || '').includes('软件系统分析与设计'))
    .slice(0, 6)
    .map((e) => ({
      tag: e.tagName,
      href: e.getAttribute('href') || '',
      cls: (e.className || '').toString().slice(0, 70),
      txt: (e.innerText || '').replace(/\s+/g, ' ').slice(0, 40),
    }));
  const anchors = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).slice(0, 25);
  return JSON.stringify({ hits, anchors, router: !!document.querySelector('#app').__vue_app__ }, null, 1);
})()
