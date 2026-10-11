(() => {
  const v = document.querySelector('video');
  if (!v) return 'NOVIDEO';
  return JSON.stringify({
    src: v.currentSrc || v.src || '',
    dur: String(v.duration),
    readyState: v.readyState,
    err: v.error ? v.error.code + '-' + v.error.message : null,
    paused: v.paused,
    url: location.href.slice(0, 130),
  });
})()
