// runner 守护：透传参数给 runner.mjs，崩溃就重启，直到 runner 自己正常退出（code 0 = 这门课跑完）
//   node supervise.mjs --course 前端框架开发技术
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), '..');
import { latestStateFile } from '../state-path.mjs';
const STATE = latestStateFile(ROOT) || path.join(ROOT, '.runner-state.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const doneCount = () => {
  try {
    return fs.existsSync(STATE) ? Object.keys(JSON.parse(fs.readFileSync(STATE, 'utf8')).done || {}).length : 0;
  } catch (e) {
    return 0;
  }
};
const args = process.argv.slice(2);
const stamp = () => new Date().toTimeString().slice(0, 8);
let rounds = 0, code = 1;

while (code !== 0 && rounds < 60) {
  rounds++;
  console.log(stamp(), `[守护] 第 ${rounds} 轮：node runner.mjs ${args.join(' ')}（累计已完成 ${doneCount()}）`);
  code = await new Promise((res) => {
    const p = spawn(process.execPath, ['runner.mjs', ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    // 正常播放每分钟有进度输出；长时间沉默说明请求或页面已挂住。
    let timer;
    // Windows 上 p.kill() 只杀直接子进程；runner 拉起的答题子进程会变成孤儿，继续抢「唯一打开中的习题会话」。
    const killTree = () => {
      if (process.platform === 'win32') {
        try { spawn('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' }); return; } catch {}
      }
      try { p.kill('SIGKILL'); } catch {}
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        console.error(stamp(), '[守护] 5 分钟无输出，终止本轮 runner（整棵进程树）后重试');
        killTree();
      }, 5 * 60 * 1000);
    };
    arm();
    // 慢消费者（管道/文件）会把 stdout 写阻塞，子进程随之停写、看门狗误杀健康 runner。
    const forward = (src, out) => src.on('data', (data) => {
      arm();
      if (!out.write(data) && typeof out.once === 'function') { src.pause(); out.once('drain', () => src.resume()); }
    });
    forward(p.stdout, process.stdout);
    forward(p.stderr, process.stderr);
    p.on('error', (e) => { clearTimeout(timer); console.error(e.message); res(1); });
    p.on('close', (value) => { clearTimeout(timer); res(value ?? 1); });
  });
  console.log(stamp(), `[守护] runner 退出 code=${code}，累计已完成 ${doneCount()}`);
  if (code === 0 || [4, 5, 6].includes(code)) break;
  await sleep(20000);
}
console.log(stamp(), code === 0 ? `[守护] 课程播放完成，共 ${rounds} 轮`
  : [4, 5, 6].includes(code) ? `[守护] 需要人工处理，已停止自动重试（code=${code}，${rounds} 轮）`
  : `[守护] 达到重启上限仍未正常结束（${rounds} 轮）`);
process.exitCode = code || 0;
