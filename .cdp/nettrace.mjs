// 抓一次页面加载期间的 gateway 请求（方法 / URL / 请求体 / 目标接口响应）
//   node nettrace.mjs [--grep pagedMyCourse] [--reload]
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const MATCH = arg('--match', 'study.cqie');
const GREP = arg('--grep', 'pagedMyCourse');
const WAIT = Number(arg('--wait', 9000));

const pages = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const tab = pages.find((t) => (t.url + ' ' + t.title).includes(MATCH)) || pages[0];
let seq = 0;
const pend = new Map();
const reqs = new Map();
const hits = [];
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(new Error('ws error'));
  ws.onmessage = (m) => {
    const x = JSON.parse(m.data);
    if (x.id && pend.has(x.id)) {
      const p = pend.get(x.id);
      pend.delete(x.id);
      x.error ? p.rej(new Error(x.error.message)) : p.res(x.result);
    } else if (x.method === 'Network.requestWillBeSent') {
      const p = x.params;
      if (p.request.url.includes('/gateway/')) {
        reqs.set(p.requestId, { url: p.request.url.replace('https://study.cqie.edu.cn', ''), method: p.request.method, postData: p.request.postData || '', headers: p.request.headers });
      }
    } else if (x.method === 'Network.responseReceived') {
      const p = x.params;
      const r = reqs.get(p.requestId);
      if (r) r.status = p.response.status;
    } else if (x.method === 'Network.loadingFinished') {
      const r = reqs.get(x.params.requestId);
      if (r && r.url.includes(GREP)) hits.push(x.params.requestId);
    }
  };
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pend.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });

await send('Network.enable', { maxTotalBufferSize: 20000000, maxResourceBufferSize: 10000000 });
await send('Page.enable');
if (process.argv.includes('--reload')) await send('Page.reload', { ignoreCache: false });
await new Promise((r) => setTimeout(r, WAIT));

const bodies = [];
for (const id of hits.slice(0, 3)) {
  try {
    const b = await send('Network.getResponseBody', { requestId: id });
    bodies.push({ url: reqs.get(id)?.url, body: (b.base64Encoded ? '<base64>' : b.body || '').slice(0, 1500) });
  } catch (e) {
    bodies.push({ url: reqs.get(id)?.url, err: String(e).slice(0, 80) });
  }
}
const posts = [...reqs.values()].filter((r) => r.method !== 'GET').slice(0, 12).map((r) => ({ url: r.url, method: r.method, body: (r.postData || '').slice(0, 900) }));
const authHeaders = [...reqs.values()].find((r) => r.headers && (r.headers.Authorization || r.headers.authorization));
console.log(
  JSON.stringify(
    {
      headerNames: authHeaders ? Object.keys(authHeaders.headers) : [],
      posts,
      bodies,
    },
    null,
    1
  )
);
ws.close();
process.exit(0);
