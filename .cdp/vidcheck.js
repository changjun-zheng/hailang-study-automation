(() => {
  const u = new URL(location.href);
  const v = document.querySelector('video');
  return JSON.stringify({
    videoIdInUrl: u.searchParams.get('videoId'),
    unitInUrl: u.searchParams.get('courseUnitId'),
    hasVideo: !!v,
    dur: v ? String(v.duration).slice(0, 8) : null,
    label: (document.body.innerText.match(/视频：[^\s]{0,30}/) || [''])[0],
  });
})()
