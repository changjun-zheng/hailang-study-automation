// 回归验：answer-codeq.mjs 里 9 道单文件题走的是同一套 buildZip，换打包器后必须重验。
// 做法：把 .cdp/codeq/ 下每个答案文件按「单文件工程」打成 zip，再用 .NET 解压回来比 SHA256。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';
import { buildZip } from '../zip-store.mjs';

const ROOT = path.join(import.meta.dirname, '..');
const DIR = path.join(ROOT, '.cdp', 'codeq');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-regress-'));
const sha = (b) => createHash('sha256').update(b).digest();

let bad = 0, n = 0;
for (const f of fs.readdirSync(DIR).filter((x) => /\.(html|vue)$/.test(x)).sort()) {
  const src = fs.readFileSync(path.join(DIR, f));
  const zip = path.join(tmp, f + '.zip');
  fs.writeFileSync(zip, buildZip([{ name: 'index.html', data: src }]));
  const out = path.join(tmp, f + '.d');
  try {
    execFileSync('powershell', ['-NoProfile', '-Command',
      `Add-Type -A System.IO.Compression.FileSystem;[IO.Compression.ZipFile]::ExtractToDirectory(${JSON.stringify(zip)},${JSON.stringify(out)})`
    ]);
    const back = fs.readFileSync(path.join(out, 'index.html'));
    const ok = timingSafeEqual(sha(src), sha(back));
    n++;
    if (!ok) { bad++; }
    console.log(`  ${ok ? '✓' : '✗'} ${f.padEnd(36)} ${src.length}B -> zip ${fs.statSync(zip).size}B -> 回来 ${back.length}B`);
  } catch (e) {
    n++; bad++;
    console.log(`  ✗ ${f.padEnd(36)} .NET 无法解析: ${String(e.stderr || e.message).slice(0, 90)}`);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `✗ ${bad}/${n} 未通过` : `✓ ${n}/${n} 单文件打包往返全等（原 9+2 道编程题的打包路径未回归破坏）`);
