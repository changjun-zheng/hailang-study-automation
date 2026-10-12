// 排队：等当前那门课跑完（守护进程打印收尾行）后，自动接着跑下一门
//   node .cdp/queue.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
// --dry：只把判定结果打出来，不启动任何播放。改判活逻辑时靠它验证，不用真跑一门课
const DRY = process.argv.includes('--dry');
const QUEUE = [
  { course: '前端框架开发技术', log: 'vue-play.log' },
  { course: '框架程序设计（Java）', log: 'java-play.log' },
];
const stamp = () => new Date().toTimeString().slice(0, 8);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 「活着没」和「跑成功没」是两个独立信号，不能共用一个判据。
// 旧实现只看日志末行是否为收尾行：进程被杀/崩溃时末行不是收尾行，于是被判成"还在跑"，
// 队列就永远停在那儿等一个已经死掉的课程 —— 2026-10-12 实测到 Java 课因此一直没起来。
const pidFileOf = (job) => path.join(ROOT, '.cdp', `job-${job.log.replace(/\.log$/, '')}.pid`);
const pidAlive = (job) => {
  let pid = 0;
  try { pid = parseInt(fs.readFileSync(pidFileOf(job), 'utf8').trim(), 10); } catch { return false; }
  if (!pid) return false;
  try { process.kill(pid, 0); } catch { return false; }
  // PID 可能已被系统复用：只认这个 PID 现在还是不是 node.exe。映像名是纯 ASCII，不经代码页转换
  try {
    const name = execFileSync('powershell', ['-NoProfile', '-File', path.join(ROOT, '.cdp', 'proc-name.ps1'), '-ProcessId', String(pid)], { encoding: 'utf8' }).trim();
    return /^node(\.exe)?$/i.test(name);
  } catch { return false; }
};
// 日志 3 分钟内还在被写也算活着：手工启动的 supervise 不会留下 PID 文件，只认 PID 会漏、进而重复起一门课
const logFresh = (job) => {
  try { return Date.now() - fs.statSync(path.join(ROOT, job.log)).mtimeMs < 3 * 60 * 1000; } catch { return false; }
};
const alive = (job) => pidAlive(job) || logFresh(job);

// 收尾行分两种：服务端确认完成 = 成功；达到重启上限 = 失败但重试已被耗尽，队列不该再自动兜圈
const doneMark = (job) => {
  const p = path.join(ROOT, job.log);
  if (!fs.existsSync(p)) return '';
  const lines = fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean);
  const last = lines[lines.length - 1] || '';
  if (/\[守护\] 课程播放完成/.test(last)) return 'ok';
  if (/\[守护\] 达到重启上限仍未正常结束/.test(last)) return 'capped';
  return '';
};

for (const job of QUEUE) {
  if (DRY) { console.log(stamp(), `[dry] 「${job.course}」 判活=${alive(job)} 收尾标记=${doneMark(job) || '无'}`); continue; }
  if (alive(job)) {
    console.log(stamp(), `[队列] 「${job.course}」已在运行，等它结束`);
    while (alive(job)) await sleep(30000);
    console.log(stamp(), `[队列] 「${job.course}」已结束`);
  }
  const mark = doneMark(job);
  if (mark === 'ok') { console.log(stamp(), `[队列] 「${job.course}」服务端已确认完成，跳过`); continue; }
  if (mark === 'capped') { console.log(stamp(), `[队列] 「${job.course}」上一轮已达重启上限，队列不再自动重试（先看成因，登录态丢失是最常见的一种）`); continue; }
  console.log(stamp(), `[队列] 开始「${job.course}」`);
  await new Promise((res) => {
    const p = spawn(process.execPath, ['.cdp/supervise.mjs', '--course', job.course], { cwd: ROOT, stdio: ['ignore', fs.openSync(path.join(ROOT, job.log), 'a'), 'inherit'] });
    fs.writeFileSync(pidFileOf(job), String(p.pid));
    p.on('exit', res);
  });
  try { fs.unlinkSync(pidFileOf(job)); } catch {}
  console.log(stamp(), `[队列] 「${job.course}」跑完`);
}
console.log(stamp(), '[队列] 全部排队任务处理完毕');
