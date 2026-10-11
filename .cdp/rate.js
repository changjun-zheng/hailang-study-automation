(() => { const v = document.querySelector('video'); if (!v) return 'NOVIDEO'; return JSON.stringify({ rate: v.playbackRate, t: +v.currentTime.toFixed(1), paused: v.paused, wall: Date.now() }); })()
