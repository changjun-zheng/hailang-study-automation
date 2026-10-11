(async () => {
  const H = { Authorization: localStorage.getItem('token2') };
  const out = [];
  for (const u of ['/gateway/file/studyRecordExercises/uploadCodeZip', '/gateway/study/studyRecordExercises/uploadCodeZip']) {
    const fd = new FormData();
    const r = await fetch(u, { method: 'POST', headers: { Authorization: localStorage.getItem('token2') }, body: fd });
    out.push(u + ' → http' + r.status + ' ' + (await r.text()).slice(0, 130).replace(/\s+/g, ' '));
  }
  const g = await (await fetch('/gateway/code/codeRun/getState?uuid=nonexistent', { headers: H })).text();
  out.push('getState → ' + g.slice(0, 110).replace(/\s+/g, ' '));
  return out.join('\n');
})()
