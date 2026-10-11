// 这段代码在页面上下文里执行：扫已加载的 chunk，只抽「像后端接口路径的字符串字面量」并去重。
// 不返回任何源码片段，只返回这些路径字符串。
(async () => {
  const KW = window.__SCAN_KW || 'xercise';
  const urls = [...new Set(performance.getEntriesByType('resource').map((e) => e.name).filter((u) => /\.js(\?|$)/.test(u)))];
  const hits = new Set();
  const errs = [];
  const QUOT = ['"', "'", '`'];
  for (const u of urls) {
    let t = '';
    try {
      t = await fetch(u).then((r) => r.text());
    } catch (e) {
      errs.push(u.split('/').pop() + ' ' + e.name);
      continue;
    }
    // 手工切字符串字面量太脆，这里用正则抓「引号包住的、含斜杠的短串」
    const re = /["'`]([A-Za-z0-9_$\-/.?{}:]{4,90})["'`]/g;
    let m;
    while ((m = re.exec(t))) {
      const s = m[1];
      if (!s.includes('/')) continue;
      if (/^(https?:|data:|\/\/|\.\/|\.\.\/|\/\*|webpack|chrome-)/.test(s)) continue;
      if (/\.(js|css|png|jpe?g|gif|svg|vue|ts|woff2?|ttf|mp4|ico)$/i.test(s)) continue;
      if (!new RegExp(KW, 'i').test(s)) continue;
      hits.add(s);
    }
  }
  return JSON.stringify({ chunks: urls.length, kw: KW, hits: [...hits].sort(), errs });
})();
