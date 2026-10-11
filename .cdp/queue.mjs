// 排队：等当前那门课跑完（守护进程打印收尾行）后，自动接着跑下一门
//   node .cdp/queue.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
// 只认守护进程真正的收尾行：每轮开始时也打印「[守护] 第 N 轮」，用它判结束会在崩溃重启的间隙误判并提前起第二门课
const DONE_MARK = /\[守护\] (课程播放完成|达到重启上限仍未正常结束)/;
const QUEUE = [
  { course: '前端框架开发技术', log: 'vue-play.log' },
  { course: '框架程序设计（Java）', log: 'java-play.log' },
];
const stamp = () => new Date().toTimeString().slice(0, 8);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const running = (logFile) => {
  const p = path.join(ROOT, logFile);
  if (!fs.existsSync(p)) return false;
  const t = fs.readFileSync(p, 'utf8');
  const lines = t.trim().split('\n').filter(Boolean);
  const last = lines[lines.length - 1] || '';
  return !DONE_MARK.test(last);
};

for (const job of QUEUE) {
  // 已经在跑的任务：等它自己结束，不重复启动
  if (fs.existsSync(path.join(ROOT, job.log)) && running(job.log)) {
    console.log(stamp(), `[队列] 「${job.course}」已在运行，等它结束`);
    while (running(job.log)) await sleep(30000);
    console.log(stamp(), `[队列] 「${job.course}」已结束`);
    continue;
  }
  console.log(stamp(), `[队列] 开始「${job.course}」`);
  await new Promise((res) => {
    const p = spawn(process.execPath, ['.cdp/supervise.mjs', '--course', job.course], { cwd: ROOT, stdio: ['ignore', fs.openSync(path.join(ROOT, job.log), 'a'), 'inherit'] });
    p.on('exit', res);
  });
  console.log(stamp(), `[队列] 「${job.course}」跑完`);
}
console.log(stamp(), '[队列] 全部排队任务处理完毕');
