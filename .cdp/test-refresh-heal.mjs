// 验「刷新后面板多久回来」：模拟他按 F5（Page.navigate 到同一个 URL），然后每 1.5 秒探一次面板版本，
// 报出恢复时间。keep 模式的注入器每 5 秒扫一遍，所以理论上 5~8 秒内该回来。
//   node .cdp/test-refresh-heal.mjs [http://127.0.0.1:9226]
const BASE = process.argv[2] || 'http://127.0.0.1:9226';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function probe() {
  const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('study.cqie.edu.cn'));
  if (!tabs.length) return { url: null, ver: null };
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const out = await new Promise((res) => {
    ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id === 1) res(x.result?.result?.value); };
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: '(()=>String((window.__kgPanel||{}).version||"none"))()', returnByValue: true } }));
    setTimeout(() => res('timeout'), 4000);
  });
  try { ws.close(); } catch (e) { }
  return { url: tabs[0].url, ver: String(out), id: tabs[0].id };
}
let a = await probe();
if (!a.url) { console.error('没有 study 标签页'); process.exit(1); }
console.log(`刷新前：面板 v${a.ver}`);
// 用 Page.navigate 打同一个 URL，等价于他按 F5
{
  const tabs = (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page' && (t.url || '').includes('study.cqie.edu.cn'));
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.send(JSON.stringify({ id: 1, method: 'Page.enable' }));
  await sleep(300);
  ws.send(JSON.stringify({ id: 2, method: 'Page.navigate', params: { url: tabs[0].url } }));
  await sleep(2500);
  try { ws.close(); } catch (e) { }
}
console.log('已模拟刷新（Page.navigate 同 URL），开始等面板回来…');
const t0 = Date.now();
let back = null;
for (let i = 0; i < 24; i++) {
  await sleep(1500);
  const p = await probe();
  const el = Math.round((Date.now() - t0) / 100) / 10;
  if (p.ver && p.ver !== 'none') { back = el; console.log(`  +${el}s 面板 v${p.ver} 回来了`); break; }
  console.log(`  +${el}s 还没有（页面在加载）`);
}
console.log(back ? `\n✓ 刷新后 ${back} 秒面板自动回来，不用手动注入` : '\n✗ 36 秒还没回来：注入器大概没在跑（看 .cdp/logs/keeper-9226.out.log）');
process.exit(back ? 0 : 1);
