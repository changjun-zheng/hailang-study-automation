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
    const p = spawn(process.execPath, ['runner.mjs', ...args], { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('exit', res);
  });
  console.log(stamp(), `[守护] runner 退出 code=${code}，累计已完成 ${doneCount()}`);
  if (code === 0) break;
  await sleep(20000);
}
console.log(stamp(), code === 0 ? `[守护] 课程播放完成，共 ${rounds} 轮` : `[守护] 达到重启上限仍未正常结束（${rounds} 轮）`);
