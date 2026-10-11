(() => {
  const v = document.querySelector('video');
  if (!v) return 'NOVIDEO';
  return JSON.stringify({
    src: (v.currentSrc || v.src || '').slice(0, 130),
    dur: v.duration,
    readyState: v.readyState,
    networkState: v.networkState,
    err: v.error ? v.error.code + '-' + v.error.message : null,
    sources: [...v.querySelectorAll('source')].map((s) => s.src.slice(0, 90)),
    url: location.href.slice(0, 120),
  });
})()
