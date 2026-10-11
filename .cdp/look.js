(() => {
  const skip = ['/file/', '/static/', 'sysMessage', 'myExam', 'listSchoolSemester', 'todoQuestion'];
  const apis = performance.getEntriesByType('resource')
    .map((e) => e.name.replace('https://study.cqie.edu.cn', ''))
    .filter((u) => u.includes('/gateway/') && !skip.some((s) => u.includes(s)))
    .slice(-8);
  return JSON.stringify({ url: location.href.slice(0, 105), apis, txt: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 420) }, null, 1);
})()
