// Shared transport for CLI entry points. Importing this module performs no I/O.
export function checkedResponse(j) {
  if (!j || Number(j.code) !== 200) {
    const error = new Error(`接口 code=${j?.code} ${j?.msg || j?.message || '响应格式异常'}`);
    error.exitCode = [401, 403, 488].includes(Number(j?.code)) ? 4 : 1;
    throw error;
  }
  return j;
}

// Serialized into browser-side batches; keep self-contained.
export async function browserRequest(url, options = {}, validate = true, expectedAccount) {
  const checkSession = () => {
    if (typeof localStorage === 'undefined') return;
    if (options.headers?.Authorization !== localStorage.getItem('token2')) throw new Error('请求期间登录会话发生变化');
    const user = JSON.parse(localStorage.getItem('userInfo2') || '{}');
    if (expectedAccount && String(user.studyNumber || user.id) !== String(expectedAccount)) throw new Error('当前账号与任务账号不一致');
  };
  checkSession();
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('接口 HTTP ' + response.status);
  const j = await response.json();
  checkSession();
  if (validate && (!j || Number(j.code) !== 200)) throw new Error('接口 code=' + j?.code + ' ' + (j?.msg || '响应格式异常'));
  return j;
}

// Also serialized into browser batches; requests remain sequential.
export async function fetchCourseList(post, filters) {
  const records = [], seen = new Set();
  for (let pageIndex = 1; pageIndex <= 200; pageIndex++) {
    const response = await post('/gateway/frequent/orgStudent/pagedMyCourse', { filters, pageIndex, pageSize: 50 });
    const page = response.data?.records || response.data?.list;
    // 被顶下线时读接口仍可能回 200 + 空 data：交给调用方打印「一门课都没返回」的会话提示，
    // 不要在这里先抛「格式异常」把真正的原因盖掉。
    if (page == null) return { data: { records } };
    if (!Array.isArray(page)) throw new Error('课程列表响应格式异常');
    let added = 0;
    for (const course of page) {
      const key = String(course.studentCourseId || course.id);
      if (!seen.has(key)) { seen.add(key); records.push(course); added++; }
    }
    const total = Number(response.data?.total);
    if (!page.length || (Number.isFinite(total) && total > 0 && records.length >= total)) return { data: { records } };
    // 不再用 page.length < 50 判末页：网关可能把页大小压小，那样会在第一页就静默截断。
    // 服务端不给 total 时以「下一页为空」或「分页未推进」作为终判。
    if (!added) throw new Error('课程分页未推进，停止读取');
  }
  throw new Error('课程分页超出上限，需要检查接口');
}

export async function connectCdp(url, { timeout = 45000, Socket = WebSocket } = {}) {
  const ws = new Socket(url);
  const pending = new Map();
  let sequence = 0;
  const rejectAll = (error) => {
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); }
    pending.clear();
  };
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error('CDP 连接超时')); ws.close(); }, timeout);
    ws.onopen = () => { clearTimeout(timer); resolve(); };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('CDP 连接失败')); };
    ws.onclose = () => { clearTimeout(timer); reject(new Error('CDP 连接已断开')); };
  });
  ws.onclose = () => rejectAll(new Error('CDP 连接已断开'));
  ws.onerror = () => rejectAll(new Error('CDP 连接错误'));
  ws.onmessage = (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    const item = pending.get(message.id);
    if (!item) return;
    clearTimeout(item.timer); pending.delete(message.id);
    message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
  };
  const send = (method, params = {}, limit = timeout) => new Promise((resolve, reject) => {
    if (ws.readyState !== 1) { reject(new Error('CDP 未连接')); return; }
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP 请求超时：' + method)); }, limit);
    pending.set(id, { resolve, reject, timer });
    try { ws.send(JSON.stringify({ id, method, params })); }
    catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
  });
  return { ws, send };
}

export function courseGap(details) {
  const seconds = (value) => {
    if (value == null || !/^\d+(?::\d+){0,2}$/.test(String(value))) throw new Error('课程时长响应缺失或格式异常');
    return String(value).split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
  };
  return seconds(details?.sumTime) - seconds(details?.haveTime);
}
