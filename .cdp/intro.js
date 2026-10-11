(() => {
  const v = document.querySelector('video');
  return JSON.stringify({
    url: location.href.slice(0, 120),
    hasVideo: !!v,
    dur: v ? +(v.duration || 0).toFixed(1) : null,
    vid: new URL(location.href).searchParams.get('videoId'),
    txt: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 260),
  }, null, 1);
})()
