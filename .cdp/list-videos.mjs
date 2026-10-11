// 把一门课的全部视频按目录顺序列出来：时长、服务端记了多少、有没有 haveTime
//   node .cdp/list-videos.mjs [courseId] [studentCourseId] [majorId]
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
const CID = process.argv[2] || 'e8716aab5bc18a56b115d3303f43555c';
const SC = process.argv[3] || '2c235454cef7b898bd11e77ad2b0d20c';
const MID = process.argv[4] || '9f07cf1e06d0a57957bd6be34efd3930';
const STATE = path.join(ROOT, '.runner-state.json');

const pages = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
const page = pages.find((t) => t.url.includes('study.cqie.edu.cn'));
if (!page) { console.error('没有 study 标签页'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
const raw = await new Promise((res) => {
  ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id === 3) res(x.result?.result?.value); };
  const expr = `(()=>{const u=JSON.parse(localStorage.getItem('userInfo2')||'{}');return fetch('/gateway/system/orgStudent/progressDetails?studentId='+u.id+'&id=${CID}&majorId=${MID}&studentCourseId=${SC}&version=BK_RJGC_2024',{headers:{Authorization:localStorage.getItem('token2')}}).then(r=>r.json()).then(j=>JSON.stringify(j.data))})()`;
  ws.send(JSON.stringify({ id: 3, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
});
ws.close();

const data = JSON.parse(raw || 'null');
if (!data) { console.error('progressDetails 没数据'); process.exit(1); }
const local = JSON.parse(fs.readFileSync(STATE, 'utf8'));
const doneKeys = new Set(Object.keys(local.done || {}));
const sec = (x) => { const s = String(x ?? ''); return s.includes(':') ? s.split(':').reduce((a, b) => a * 60 + Number(b), 0) : Number(s) || 0; };

let n = 0, credited = 0, localDoneButUncredited = 0;
console.log('关卡/单元/视频  ——  服务端 haveTime / 时长   [本地是否记为播完]');
(function w(ns, depth) {
  for (const x of ns || []) {
    const pad = '  '.repeat(depth);
    if (x.name || x.catalogName) console.log(`${pad}· ${x.name || x.catalogName}`);
    for (const v of x.courseCatalogVideoVos || []) {
      n++;
      const h = sec(v.haveTime), t = sec(v.timeLength);
      const mine = doneKeys.has(v.videoId || v.id);
      if (h > 0) credited++;
      if (mine && h === 0) localDoneButUncredited++;
      console.log(`${pad}  ${String(v.name).slice(0, 30).padEnd(32)} ${v.haveTime || '—'} / ${v.timeLength}  ${mine ? (h >= t && t > 0 ? '[本地播完✓服务端也记]' : '[本地播完✗服务端没记]') : '[本地没播过]'}`);
    }
    w(x.children, depth + 1);
  }
})(Array.isArray(data) ? data : data.courseCatalogVos || data.records || [], 0);
console.log(`\n合计 ${n} 条视频，服务端记了 ${credited} 条，本地判为播完但服务端没记的 ${localDoneButUncredited} 条`);
process.exit(0);
