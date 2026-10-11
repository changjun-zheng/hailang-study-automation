(() => {
  const skip = ['/file/', '/static/', 'sysMessage', 'myExam', 'listSchool', 'todoQuestion', 'alicdn'];
  const apis = performance.getEntriesByType('resource')
    .map((e) => e.name.replace('https://study.cqie.edu.cn', ''))
    .filter((u) => u.includes('/gateway/') && !skip.some((s) => u.includes(s)))
    .slice(-12);
  return JSON.stringify({ url: location.href.slice(0, 100), apis, txt: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300) }, null, 1);
})()
