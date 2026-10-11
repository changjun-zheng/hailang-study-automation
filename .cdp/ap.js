(async () => {
  const v = document.querySelector('video');
  if (!v) return 'NOVIDEO';
  const wasMuted = v.muted;
  const r = await v.play().then(() => 'ok').catch((e) => 'rejected:' + e.name);
  await new Promise((x) => setTimeout(x, 2500));
  const now = document.querySelector('video');
  return JSON.stringify({ muted: wasMuted, playResult: r, stillPlaying: now.paused === false, t: +now.currentTime.toFixed(1) });
})()
