// 纯本地：从已有的习题快照里把两道多文件编程题的题干还原出来（不发起任何网络请求）
import fs from 'node:fs';

const strip = (h) =>
  String(h || '')
    .replace(/<\s*(br|\/p|\/div|\/li|\/pre)\s*\/?\s*>/gi, String.fromCharCode(10))
    .replace(/<img[^>]*>/gi, '[图片]')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\u00a0/g, ' ')
    .replace(/(?:\r?\n){3,}/g, String.fromCharCode(10, 10))
    .trim();

const hit = (q) => q.questionType === 7 && /多个页面|学习视频和讲义/.test(String(q.referenceAnswer || ''));

for (const f of process.argv.slice(2)) {
  let arr;
  try {
    arr = JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    continue;
  }
  const walk = (x, out) => {
    if (Array.isArray(x)) x.forEach((y) => walk(y, out));
    else if (x && typeof x === 'object') {
      if (x.questionType === 7 || x.id && x.referenceAnswer) out.push(x);
      Object.values(x).forEach((y) => walk(y, out));
    }
  };
  const qs = [];
  walk(arr, qs);
  for (const q of qs) {
    if (!hit(q)) continue;
    console.log('='.repeat(70));
    console.log('文件:', f, '| qid:', q.id, '| 单元:', q.catalogName || q.unitName || '?');
    console.log('语言:', q.languageName, '| baseFileName:', q.baseFileName);
    console.log('--- 题干 ---');
    console.log(strip(q.content).slice(0, 2500));
    console.log('--- 平台给的"答案" ---');
    console.log(strip(q.referenceAnswer).slice(0, 400));
  }
}
