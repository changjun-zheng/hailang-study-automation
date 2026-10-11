(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const paths = [
    'correct','correctQuestion','submit','submitAnswer','save','add','update','correction','doCorrect','correctExercises','clientSubmit','clientCorrect','examCorrect','questionCorrect',
  ];
  const out = [];
  for (const p of paths) {
    const u = '/gateway/study/studyRecordQuestionError/' + p;
    const r = await fetch(u, { method: 'POST', headers: H, body: '{}' });
    let msg = '';
    try { const j = JSON.parse(await r.clone().text()); msg = 'code' + j.code + ' ' + String(j.msg || '').slice(0, 24); } catch (e) { msg = (await r.text()).slice(0, 24); }
    if (r.status !== 404) out.push('HIT ' + p + ' → http' + r.status + ' ' + msg);
  }
  const gets = ['detail', 'info', 'correct', 'list', 'clientList'];
  for (const p of gets) {
    const r = await fetch('/gateway/study/studyRecordQuestionError/' + p, { method: 'GET', headers: H });
    if (r.status !== 404) out.push('HIT-GET ' + p + ' → http' + r.status);
  }
  return out.length ? out.join('\n') : '全部 404，这批名字都不对';
})()
