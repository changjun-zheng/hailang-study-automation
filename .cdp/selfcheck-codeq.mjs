// 离线自检：验证 .cdp/codeq/proj/<qid>/ 手写的 Vue 工程语法正确，并复现 answer-codeq.mjs 的打包路径。
// 不发任何网络请求。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash, timingSafeEqual } from 'node:crypto';
import { buildZip } from '../zip-store.mjs';

const ROOT = path.join(import.meta.dirname, '..'); // 本脚本在 .cdp/ 下，工程根要退一层
const PROJ_ROOT = path.join(ROOT, '.cdp', 'codeq', 'proj');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codeq-selfcheck-'));

// 与 answer-codeq.mjs 完全一致的探测逻辑
const projDirOf = (qid) => {
  const d = path.join(PROJ_ROOT, qid);
  if (!fs.existsSync(d)) return null;
  const files = [];
  const walk = (p, rel) => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(p, e.name), rel + e.name + '/');
      else files.push(rel + e.name);
    }
  };
  walk(d, '');
  return files.length >= 3 ? { dir: d, files } : null;
};

// ESM 语法检查：node --check 默认按 CommonJS 解析，import/export 要先落成 .mjs
const checkEsm = (label, code) => {
  const f = path.join(tmp, label.replace(/[^\w-]/g, '_') + '.mjs');
  fs.writeFileSync(f, code, 'utf8');
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    return null;
  } catch (e) {
    return String(e.stderr || e.message).split(String.fromCharCode(10)).slice(0, 4).join(' / ');
  }
};

// 从 SFC 里取 <script ...> 内容；顺带查 template 是否配对（<template #header> 也算开标签）
const sfc = (src) => {
  const m = src.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  const tmplOpen = (src.match(/<template[\s>]/g) || []).length;
  const tmplClose = (src.match(/<\/template>/g) || []).length;
  return { js: m ? m[1] : '', balanced: tmplOpen === tmplClose && tmplOpen >= 1 };
};

let bad = 0;
for (const qid of fs.readdirSync(PROJ_ROOT)) {
  const proj = projDirOf(qid);
  console.log('='.repeat(72));
  console.log(qid, proj ? `识别为多文件工程（${proj.files.length} 个文件）` : '✗ 未被识别（文件数 < 3？）');
  if (!proj) { bad++; continue; }
  for (const rel of proj.files.sort()) {
    const abs = path.join(proj.dir, rel);
    const src = fs.readFileSync(abs, 'utf8');
    let note = `${fs.statSync(abs).size}B`; // 报字节数不报字符数：中文 UTF-8 是 3 字节，混用会造出假阳性
    if (rel.endsWith('.js')) {
      const err = checkEsm(qid + '-' + rel, src);
      note += err ? '  ✗ ESM 语法错误: ' + err : '  ✓ ESM 语法通过';
      if (err) bad++;
    } else if (rel.endsWith('.vue')) {
      const { js, balanced } = sfc(src);
      const err = js.trim() ? checkEsm(qid + '-' + rel, js) : null;
      note += !balanced ? '  ✗ <template> 未闭合' : err ? '  ✗ script 语法错误: ' + err : '  ✓ SFC 结构+script 通过';
      if (!balanced || err) bad++;
    } else if (rel.endsWith('.json')) {
      try { JSON.parse(src); note += '  ✓ JSON 合法'; } catch (e) { note += '  ✗ JSON 非法: ' + e.message; bad++; }
    } else if (rel.endsWith('.html')) {
      note += /<div id="app"><\/div>/.test(src) && /src="\/src\/main\.js"/.test(src) ? '  ✓ 挂载点与入口齐' : '  ✗ 缺挂载点或入口';
      if (!/id="app"/.test(src)) bad++;
    }
    console.log(`   ${rel.padEnd(26)} ${note}`);
  }

  // 复现 answer-codeq.mjs 的打包：同一套 entries -> buildZip
  const entries = proj.files.map((rel) => ({ name: rel, data: fs.readFileSync(path.join(proj.dir, rel)) }));
  const zip = path.join(tmp, qid + '.zip');
  fs.writeFileSync(zip, buildZip(entries));
  // 让 .NET 反过来解析我手写的 zip —— 头部写错它直接抛异常
  const listCmd = `Add-Type -A System.IO.Compression.FileSystem;$z=[IO.Compression.ZipFile]::OpenRead(${JSON.stringify(zip)});$z.Entries|%{$_.FullName+'|'+$_.Length}|sort;$z.Dispose()`;
  const rows = execFileSync('powershell', ['-NoProfile', '-Command', listCmd]).toString().split(/\r?\n/).filter(Boolean);
  console.log(`   → zip ${fs.statSync(zip).size} 字节，.NET 解析出 ${rows.length} 条：`);
  for (const r of rows) console.log('     ' + r);
  if (!rows.some((e) => /^src[\\/]/.test(e))) { console.log('   ✗ 子目录没进 zip'); bad++; }
  if (rows.some((e) => e.includes('\\'))) { console.log('   ✗ 条目名含反斜杠'); bad++; }
  // 端到端往返：让 .NET 真解压回磁盘，再逐文件比 SHA256。
  // 不走 stdout 比对——PowerShell 会把中文按控制台代码页(GBK)转一道，比出来的差异是假阳性。
  const out = path.join(tmp, qid);
  execFileSync('powershell', ['-NoProfile', '-Command',
    `Add-Type -A System.IO.Compression.FileSystem;[IO.Compression.ZipFile]::ExtractToDirectory(${JSON.stringify(zip)},${JSON.stringify(out)})`
  ]);
  let diff = 0;
  for (const rel of proj.files) {
    const a = fs.readFileSync(path.join(proj.dir, rel));
    const p = path.join(out, ...rel.split('/'));
    if (!fs.existsSync(p)) { console.log(`   ✗ 解压后缺失 ${rel}`); diff++; continue; }
    if (!timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(fs.readFileSync(p)).digest())) {
      console.log(`   ✗ 内容不一致 ${rel}`);
      diff++;
    }
  }
  console.log(diff ? `   ✗ 往返 ${diff}/${proj.files.length} 个文件不一致` : `   ✓ 往返一致：${proj.files.length}/${proj.files.length} 个文件 SHA256 全等`);
  if (diff) bad++;
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log('='.repeat(72));
console.log(bad ? `✗ ${bad} 项未通过` : '✓ 两个工程全部通过，打包结构含子目录');
