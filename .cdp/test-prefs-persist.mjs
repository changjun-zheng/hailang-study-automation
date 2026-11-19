// 面板「开关记忆」的端到端回归：整页重载之后，三个开关还在不在。
// 自己起一个 headless Chrome（临时 profile + 临时本地站点），跑完只关自己起的这个进程。
//   node .cdp/test-prefs-persist.mjs
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';

const SRC = fs.readFileSync('hailang-panel.user.js', 'utf8');
// 版本号从脚本头读，发版时不用再手改断言（这里曾经写死 0.5.4，面板升到 0.5.5 后必红）。
const PANEL_VERSION = (SRC.match(/@version\s+([\d.]+)/) || [])[1] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 端口不能写死：上一轮 proc.kill() 在 Windows 只杀掉启动器，Chrome 子进程会继续占着
// 9321/9322 —— 下一次测试连到的是旧实例和旧 localStorage，断言全红还查不出原因。
const srv = http.createServer((req, res) => {
  if (req.url.includes('/gateway/')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"code":500,"msg":"fixture"}'); }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><title>夹具</title><body><h3>面板开关记忆夹具</h3></body>');
});
await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
const PORT = srv.address().port;
const BASE = `http://127.0.0.1:${PORT}`;

const chrome = path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe');
if (!fs.existsSync(chrome)) { console.error('找不到 chrome.exe：' + chrome); process.exit(1); }
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kg-prefs-'));
const proc = spawn(chrome, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-background-timer-throttling',
  BASE + '/stu/fix.html',
], { stdio: 'ignore' });
const killChrome = () => {
  if (process.platform === 'win32') {
    // Windows 上 proc.pid 可能只是启动器（Chrome 会自己再拉一个浏览器进程），
    // 按 PID /T 杀不干净；按命令行里的临时 profile 路径匹配才可靠，也不会误伤用户自己的 Chrome。
    // PowerShell 的 -like 里反斜杠是普通字符，不能转义；只处理单引号
    const esc = profile.replace(/'/g, "''");
    const ps = `Get-CimInstance Win32_Process -Filter "name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${esc}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    try { spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'ignore', timeout: 15000 }); return; } catch (e) { }
  }
  try { proc.kill('SIGKILL'); } catch (e) { }
};

const fail = [];
const ok = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); if (!cond) fail.push(name); };

// --remote-debugging-port=0 时 Chrome 把实际端口写进 profile/DevToolsActivePort
let CDP = 0;
for (let i = 0; i < 80 && !CDP; i++) {
  await sleep(250);
  try { CDP = Number(fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]) || 0; } catch (e) { }
}
let tab = null;
for (let i = 0; i < 60 && !tab; i++) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
    tab = list.find((t) => t.type === 'page' && t.url.includes('/stu/'));
  } catch (e) { }
}
if (!tab) { console.error('headless Chrome 没起来，测试作废'); killChrome(); srv.close(); process.exit(1); }

let seq = 0; const pend = new Map();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
ws.onmessage = (e) => { const x = JSON.parse(e.data); if (x.id && pend.has(x.id)) { const p = pend.get(x.id); pend.delete(x.id); x.error ? p.rej(new Error(x.error.message)) : p.res(x.result); } };
const send = (m, p = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method: m, params: p })); });
const evl = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description || r.exceptionDetails.text).slice(0, 200));
  return r.result?.value;
};
const READ = `(()=>{const q=(s)=>document.querySelector(s);return JSON.stringify({
  面板:(q('#kg-panel')||{}).id||'没注入', 版本:(window.__kgPanel||{}).version||'-',
  自动起播勾:!!(q('#kg-auto')||{}).checked, 自动做题勾:!!(q('#kg-ansauto')||{}).checked,
  声音钮:(q('#kg-sound')||{}).textContent||'-',
  G自动起播:(window.__kgPanel||{}).G?.autoStart, G自动做题:(window.__kgPanel||{}).G?.answerAfter, G声音:(window.__kgPanel||{}).G?.mode,
  存盘:localStorage.getItem('kg-prefs')||'null'})})()`;

await send('Runtime.enable'); await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: SRC });
const reload = async () => { await send('Page.reload', { ifOpened: true }); for (let i = 0; i < 30; i++) { await sleep(500); if ((JSON.parse(await evl(READ))).面板 === 'kg-panel') return; } };
await sleep(2500);
// 注入器只对「下一个文档」生效，首屏那次加载赶不上 —— 必须先重载一次，否则读到的永远是空页面
await reload();

console.log('【第 1 段】默认态（没存过任何偏好）');
let s = JSON.parse(await evl(READ));
ok('面板已注入且是最新构建', s.面板 === 'kg-panel' && s.版本 === PANEL_VERSION, '版本 ' + s.版本 + '（脚本头 ' + PANEL_VERSION + '）');
ok('「停着就自己起播」默认勾上', s.自动起播勾 === true);
ok('「刷完自动做题」默认不勾', s.自动做题勾 === false);
ok('声音默认静音', /静音/.test(s.声音钮), s.声音钮);

console.log('【第 2 段】用户改三个开关，然后整页重载（就是换一条视频时发生的事）');
// 三态循环是 静音 → 微声保活 → 开，所以只点一下才是微声保活
await evl(`document.querySelector('#kg-ansauto').click(); document.querySelector('#kg-sound').click(); 'ok'`);
const before = JSON.parse(await evl(READ));
ok('改动已落 localStorage.kg-prefs', /answerAfter/.test(before.存盘) && /whisper/.test(before.存盘), before.存盘);
await reload();
s = JSON.parse(await evl(READ));
ok('重载后「刷完自动做题」仍勾着', s.自动做题勾 === true && s.G自动做题 === true);
ok('重载后「自动起播」仍勾着', s.自动起播勾 === true && s.G自动起播 === true);
ok('重载后声音档仍是微声保活（按钮文字）', /微声保活/.test(s.声音钮), s.声音钮);
ok('重载后 G.mode 仍是 whisper', s.G声音 === 'whisper', String(s.G声音));

console.log('【第 3 段】反向：取消勾选也要活过一次重载');
await evl(`document.querySelector('#kg-ansauto').click(); document.querySelector('#kg-auto').click(); 'ok'`);
await reload();
s = JSON.parse(await evl(READ));
ok('重载后「刷完自动做题」保持不勾', s.自动做题勾 === false && s.G自动做题 === false);
ok('重载后「自动起播」保持不勾', s.自动起播勾 === false && s.G自动起播 === false);

console.log(fail.length ? `\n✗ ${fail.length} 条断言没过：${fail.join(' / ')}` : '\n✓ 全部断言通过');
try { ws.close(); } catch (e) { }
killChrome();
srv.close();
// Chrome 刚被杀时临时目录里的文件还被句柄握着，删不动就留着报路径，不让它把测试结果盖掉
await sleep(1200);
try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 6, retryDelay: 700 }); }
catch (e) { console.log('（临时 profile 没删掉，可手动清理：' + profile + '）'); }
process.exit(fail.length ? 4 : 0);
