// 播放进度状态文件按学号分文件。
// 起因：.runner-state.json 的 key 只有 videoId / unit:<id>，没有账号维度，
// 拿同一份状态跑第二个账号会把它没看过的视频当成「已看过」直接跳过。
import fs from 'node:fs';
import path from 'node:path';

export function stateFileFor(root, studyNumber) {
  return path.join(root, studyNumber ? `.runner-state-${studyNumber}.json` : '.runner-state.json');
}

// 只读诊断脚本不知道当前是哪个账号，取最近被写过的那一份
export function latestStateFile(root) {
  let names = [];
  try { names = fs.readdirSync(root); } catch { return null; }
  const cands = names
    .filter((f) => /^\.runner-state(?:-[^.]+)?\.json$/.test(f))
    .map((f) => ({ f, t: fs.statSync(path.join(root, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return cands.length ? path.join(root, cands[0].f) : null;
}
