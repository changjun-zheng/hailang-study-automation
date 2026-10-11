(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const bodies = [
    { courseId: '4fafa68754ee9872feb67b4cda5f2c4f', studentCourseId: '255b69a5ce54ba7a2c6caa5321b323f7', version: 'BK_RJGC_2024', unitId: 'e47450a694d5b7800ac035017d253c11' },
    { courseId: '4fafa68754ee9872feb67b4cda5f2c4f', studentCourseId: '255b69a5ce54ba7a2c6caa5321b323f7', version: 'BK_RJGC_2024' },
  ];
  const out = [];
  for (const b of bodies) {
    const r = await (await fetch('/gateway/system/orgStudent/checkAdvance', { method: 'POST', headers: H, body: JSON.stringify(b) })).json();
    out.push({ body: Object.keys(b).join(','), res: JSON.stringify(r).slice(0, 300) });
  }
  return JSON.stringify(out, null, 1);
})()
