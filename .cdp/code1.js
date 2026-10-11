(async () => {
  const H = { Authorization: localStorage.getItem('token2'), 'Content-Type': 'application/json' };
  const post = async (b) => {
    const r = await fetch('/gateway/code/codeRun/submitCode', { method: 'POST', headers: H, body: JSON.stringify(b) });
    const t = await r.text();
    return Object.keys(b).join(',') + '\n    → ' + t.slice(0, 160).replace(/\s+/g, ' ');
  };
  const out = [];
  out.push(await post({}));
  out.push(await post({ code: 'public class Main{}' }));
  out.push(await post({ code: 'public class Main{}', language: 'java' }));
  out.push(await post({ code: 'public class Main{}', language: 'java', exercisesId: 'x' }));
  out.push(await post({ code: 'public class Main{}', language: 'java', unitId: '637e13855783d8a848d38a25bded5d2f', courseId: '4fafa68754ee9872feb67b4cda5f2c4f', studentCourseId: '255b69a5ce54ba7a2c6caa5321b323f7' }));
  return out.join('\n');
})()
