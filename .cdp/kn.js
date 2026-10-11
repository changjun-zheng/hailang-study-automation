(async () => {
  const t = await (await fetch('/stu/assets/index.fd04d2e9.js')).text();
  const out = {};
  for (const m of t.matchAll(/[,"{]([A-Za-z][A-Za-z0-9_]*(?:Knowledge|knowledge)[A-Za-z0-9_]*)\s*:\s*"([^"]+)"/g)) out[m[1]] = m[2];
  return JSON.stringify(out, null, 1);
})()
