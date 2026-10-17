// 优雅关掉**我自己起的**那个 CDP 实例（只连指定端口发 Browser.close）。
// 绝不按进程名杀 chrome.exe —— 那会连他正开着的窗口一起带走。
//   node .cdp/close-instance.mjs http://127.0.0.1:9225
const BASE = process.argv[2] || 'http://127.0.0.1:9225';
const ver = await (await fetch(BASE + '/json/version')).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
await new Promise((r) => setTimeout(r, 2500));
try { ws.close(); } catch (e) { }
let alive = true;
try { await (await fetch(BASE + '/json/version')).json(); } catch (e) { alive = false; }
console.log(alive ? `? ${BASE} 还在应答，没关掉` : `✓ ${BASE}（${ver.Browser}）已关闭`);
process.exit(alive ? 1 : 0);
