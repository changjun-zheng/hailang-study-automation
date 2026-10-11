(async () => {
  const H = { Authorization: localStorage.getItem('token2') };
  const g = async (u) => JSON.parse(await (await fetch(u, { headers: H })).text());
  const d = await g('/gateway/system/orgStudent/myCourseDetails?studentId=YOUR_STUDENT_ID&id=4fafa68754ee9872feb67b4cda5f2c4f');
  const x = d.data || {};
  const arrs = Object.keys(x).filter((k) => Array.isArray(x[k]) && x[k].length).map((k) => k + '(' + x[k].length + ') item{' + Object.keys(x[k][0] || {}).slice(0, 10).join(',') + '}');
  return JSON.stringify({ keys: Object.keys(x).slice(0, 40), arrays: arrs, sumUnit: x.sumUnit, haveUnit: x.haveUnit, learned: x.learned, intro: x.videoUrl }, null, 1);
})()
