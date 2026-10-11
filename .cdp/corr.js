(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const r = document.querySelector('#app').__vue_app__.config.globalProperties.$router;
  const rt = r.getRoutes().filter((x) => /Mistake/i.test(x.path)).map((x) => x.path);
  const post = async (b) => {
    const t = await (await fetch('/gateway/study/studyRecordQuestionError/questionDetails', { method: 'POST', headers: H, body: JSON.stringify(b) })).text();
    return { keys: Object.keys(b).join(','), head: t.slice(0, 160) };
  };
  const tries = [
    await post({ recordId: '975c14d24c844da9ac7642f4e9ddfdb6', exercisesId: '72e256918add84f697a39f031df820b8' }),
    await post({ id: '975c14d24c844da9ac7642f4e9ddfdb6' }),
    await post({ exercisesId: '72e256918add84f697a39f031df820b8' }),
    await post({ recordId: '975c14d24c844da9ac7642f4e9ddfdb6' }),
  ];
  return JSON.stringify({ routes: rt, tries }, null, 1);
})()
