(async () => {
  const c = '/stu/assets/index.416ff6d1.js';
  const t = await (await fetch(c)).text();
  const out = [];
  for (const needle of ['exercisesList(', 'submitExercises', 'saveExercises', 'answerExercises', 'commitExercises', 'H.']) {
    if (needle === 'H.') continue;
    let i = -1, n = 0;
    while ((i = t.indexOf(needle, i + 1)) > -1 && n < 2) { out.push({ needle, win: t.slice(Math.max(0, i - 320), i + 480) }); n++; }
  }
  // 找所有 H.xxx( 形式的接口调用名，去重后列出，便于看出提交函数叫什么
  const calls = new Set();
  for (const m of t.matchAll(/\bH\.([A-Za-z][A-Za-z0-9_]*)\(/g)) calls.add(m[1]);
  return JSON.stringify({ windows: out, apiCallsInPage: [...calls] }, null, 1).slice(0, 3600);
})()
