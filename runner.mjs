// 海浪智学 · 课程自动播放 runner
// 用法：node runner.mjs [--course 软件系统分析与设计] [--dry] [--barrier 关卡名]
// 依赖：本机已起 9224 调试 Chrome 且该 profile 已登录（取证工具在 .cdp/）
const BASE = process.env.CDP_BASE || 'http://127.0.0.1:9224';
const fs = await import('node:fs');
const path = await import('node:path');
const os = await import('node:os');
const { spawn } = await import('node:child_process');

const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > -1 ? process.argv[i + 1] : d;
};
const has = (n) => process.argv.includes(n);
const COURSE = arg('--course', '软件系统分析与设计');
const ONLY_BARRIER = arg('--barrier', '');
const DRY = has('--dry');
// --answer：每关视频记账完成后，接着做这一关的客观题（复用 answer-exercises.mjs，不复制答题逻辑）。
// 默认关 —— 往账号里写答案必须是显式选择。
const ANSWER = has('--answer');
// --answer-only：跳过刷视频，只跑答题。用来单独验证答题链路，也方便只想补题的时候用。
const ANSWER_ONLY = has('--answer-only');
// 答题默认只统计不提交；必须再显式给 --apply 才往账号里写答案
const APPLY_ANSWER = has('--apply');
const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const STATE = path.join(ROOT, '.runner-state.json');
// HAILANG_RATE 用来临时改注入脚本的默认倍速（验「服务端是不是只认实时观看」时设成 1）；不设就是脚本里的 2。
const PLAYERSRC = (process.env.HAILANG_RATE ? `self.__kgRate=${Number(process.env.HAILANG_RATE)};` : '') + fs.readFileSync(path.join(ROOT, 'hailang-background-play.user.js'), 'utf8');

const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- CDP ----------
// 9224 没在监听就自己拉起调试 Chrome：登录态存在独立 profile 里，所以不需要重新登录
async function cdpAlive() {
  try {
    return (await fetch(BASE + '/json/version', { signal: AbortSignal.timeout(2500) })).ok;
  } catch (e) {
    return false;
  }
}
if (!(await cdpAlive())) {
  const user = os.userInfo().username;
  const chrome = `C:\\Users\\${user}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`;
  const profile = `C:\\Users\\${user}\\.hailang-chrome-profile`;
  console.log('9224 未监听，自动拉起调试 Chrome（独立 profile，登录态在里面上次已存）');
  // 关键三个开关：不这么做的话，Chrome 会把「被别的应用完全挡住」的窗口当成后台，
  // 直接推迟媒体加载（readyState 恒 0、duration=NaN），runner 就只能每次导航都把窗口顶到前台 —— 那会把他的屏幕抢走。
  // --disable-backgrounding-occluded-windows 让被遮挡窗口保持"可见"，后两个保住定时器与渲染进程优先级。
  // 无头模式：屏幕上根本不出现窗口，彻底杜绝"每换一条视频就弹一次"。
  // 他明确说过可见窗口（哪怕挪到屏幕外）会干扰学习 —— Windows 会把 -30000 的坐标夹回屏内，所以停放不可靠。
  const HEADLESS = process.env.HAILANG_HEADLESS !== '0';
  const args = ['--remote-debugging-port=9224', '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', 'https://study.cqie.edu.cn/stu/home'];
  if (HEADLESS) args.splice(5, 0, '--headless=new', '--disable-gpu', '--window-size=1440,900', '--autoplay-policy=no-user-gesture-required');
  const p = spawn(chrome, args, { detached: true, stdio: 'ignore' });
  p.unref();
  for (let i = 0; i < 25 && !(await cdpAlive()); i++) await sleep(1000);
  if (!(await cdpAlive())) {
    console.error('拉不起来：确认 chrome.exe 路径，或手动跑一次带 --remote-debugging-port 的启动命令');
    process.exit(1);
  }
  await sleep(5000);
  console.log('调试 Chrome 已就绪');
}
// runner 必须独占一个标签页：否则任何在同标签页里的导航都会打断播放（踩过）。
// 用锁文件记住 targetId，标签没了就新建一个，绝不跟取证脚本抢同一个页面。
const LOCK = path.join(ROOT, '.cdp', 'runner-tab.json');
const listPages = async () => (await (await fetch(BASE + '/json/list')).json()).filter((t) => t.type === 'page');
let pinned = null;
try {
  pinned = JSON.parse(fs.readFileSync(LOCK, 'utf8')).id;
} catch (e) {}
const pages = await listPages();
let tab = pinned && pages.find((t) => t.id === pinned);
let reusedTab = false;
if (!tab) {
  const created = await (await fetch(BASE + '/json/new?about:blank', { method: 'PUT' })).json();
  tab = created;
  fs.writeFileSync(LOCK, JSON.stringify({ id: created.id, at: new Date().toISOString() }, null, 1));
  log('为 runner 新建独占标签页 ' + created.id.slice(0, 10));
} else {
  reusedTab = true;
  log('沿用 runner 独占标签页 ' + tab.id.slice(0, 10));
}
let seq = 0;
const inflight = new Map();
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(new Error('CDP ws 连接失败'));
  ws.onmessage = (m) => {
    const x = JSON.parse(m.data);
    if (x.id && inflight.has(x.id)) {
      const p = inflight.get(x.id);
      inflight.delete(x.id);
      x.error ? p.rej(new Error(x.error.message)) : p.res(x.result);
    }
  };
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    inflight.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evl = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'eval 异常').slice(0, 300));
  return r.result?.value;
};
await send('Page.enable');
await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: PLAYERSRC });
log('后台续播脚本已在 document-start 注册');
await parkWindow();

// 注册只对「下一次文档加载」生效。沿用旧标签页时页面还是上个进程注入的旧脚本在跑，
// 不强制重载的话，新加的功能（静音、倍速）要等到跨关卡导航才起作用。
if (reusedTab && tab.url.includes('study.cqie.edu.cn')) {
  await send('Page.reload', { ignoreCache: true });
  await softOrActivate('强制重载后');
  log('沿用旧标签页，已强制重载让新脚本生效');
}

// 新建的独占标签是 about:blank，先落到站点源上才拿得到 localStorage 里的登录态
if (!tab.url.includes('study.cqie.edu.cn')) {
  await send('Page.navigate', { url: 'https://study.cqie.edu.cn/stu/home' });
  for (let i = 0; i < 30; i++) {
    await sleep(1500);
    const ok = await evl(`!!localStorage.getItem('token2')`).catch(() => false);
    if (ok) break;
  }
}

// ---------- 平台接口（在页面上下文里发同源请求，鉴权头由页面自己带） ----------
async function getJson(url) {
  return guard(JSON.parse(await evl(`fetch(${JSON.stringify(url)}, {headers:{Authorization: localStorage.getItem('token2')}}).then(r=>r.text())`)));
}
// 这个平台一个账号只允许一个在线会话：他在别处登录就会把 runner 这个会话踢下线。
// 被踢之后**读接口还会返回 200**（有时是空 data，有时直接 code:488），但**写接口全部静默丢弃** ——
// 表现就是"视频一条条播完、服务端一条记录都不加"。昨天就是这么白烧了 7 小时，所以这里必须主动识别并退出。
const guard = (j) => {
  const msg = String((j && j.msg) || '');
  if (j && (j.code === 488 || /退出登录|其他设备|其它设备/.test(msg))) {
    log('! 会话已被服务端登出：' + msg);
    log('! 单账号只允许一个在线会话，请先在 runner 这个 Chrome 里重新登录，再跑（他那边会被踢，二者不能同时用）。');
    ws.close();
    process.exit(4);
  }
  return j;
};

async function postJson(url, body) {
  return guard(
    JSON.parse(
      await evl(`fetch(${JSON.stringify(url)}, {method:'POST', headers:{Authorization: localStorage.getItem('token2'),'Content-Type':'application/json'}, body: ${JSON.stringify(JSON.stringify(body))}}).then(r=>r.text())`)
    )
  );
}

const prof = JSON.parse(await evl(`JSON.stringify((()=>{const u=JSON.parse(localStorage.getItem('userInfo2')||'{}');return {id:u.id||'',majorId:u.majorId||'',studyNumber:u.studyNumber||u.id||''}})())`));
const me = prof.id;
const majorId = prof.majorId;
const courses = await postJson('/gateway/frequent/orgStudent/pagedMyCourse', {
  filters: { courseNature: null, name: '', schoolYear: '', studentId: me, term: '', courseFlag: 0 },
  pageIndex: 1,
  pageSize: 50,
});
const course = ((courses.data && (courses.data.records || courses.data.list)) || []).find((c) => c.name === COURSE);
if (!course) {
  const got = (courses.data?.records || courses.data?.list) || [];
  console.error(`没找到课程「${COURSE}」，可选：` + got.map((c) => c.name).join(' / '));
  if (!got.length) console.error('一门课都没返回 —— 最可能是这个会话已被别处登录顶掉（单账号单会话），请在 runner 的 Chrome 里重新登录');
  process.exit(1);
}
log(`课程=${course.name} 已学=${course.learned} 任务=${course.haveUnit}/${course.sumUnit}`);

const barriersResp = await getJson(`/gateway/system/orgStudent/listCourseBarrier?courseId=${course.id}&majorId=${majorId}&userId=${me}&version=${course.version}&studentCourseId=${course.studentCourseId}`);
const bList = (barriersResp.data || []).slice().sort((a, b) => (a.sortCode || 0) - (b.sortCode || 0));
log(`关卡数=${bList.length}`);
if (ANSWER_ONLY) {
  log('只答题，不刷视频');
  await runAnswerScript(APPLY_ANSWER ? ['--apply'] : []);
  ws.close();
  process.exit(0);
}


const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { done: {}, exercises: {} };
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 1));

// 一个关卡下的视频清单（接口返回扁平数组：id=课程单元id）
async function videosOf(barrierId) {
  const r = await getJson(`/gateway/system/orgStudent/listCatalogBarrier?barrierId=${barrierId}&studentCourseId=${course.studentCourseId}`);
  return (r.data || []).filter((n) => n.videoId).map((n) => ({ unitId: n.id, videoId: n.videoId, name: n.catalogName || '', seconds: n.timeLength || 0, videoStatus: n.studyVideoStatus }));
}
// 权威枚举：学习页自己用的就是 progressDetails，它给的是一整棵目录树。
// listCourseBarrier 会漏掉「课程介绍」这种没有子节点的顶层关卡 —— 实测整棵树 41 条、关卡接口只给 40 条，
// 于是终态门看着"40/40 全绿"就宣布课程完成，而那 183 秒的视频从来没被播过（记录全为 null）。
async function progressVideos() {
  const r = await getJson(`/gateway/system/orgStudent/progressDetails?studentId=${prof.studyNumber}&id=${course.id}&majorId=${majorId}&studentCourseId=${course.studentCourseId}&version=${course.version}`);
  const out = [];
  const walk = (n) => {
    for (const v of n.courseCatalogVideoVos || []) out.push({ unitId: v.unitId || n.id, videoId: v.id, name: v.name || '', seconds: v.timeLength || 0, videoStatus: v.studyVideoStatus });
    for (const c of n.children || []) walk(c);
  };
  (Array.isArray(r.data) ? r.data : []).forEach(walk);
  return out;
}
// 练习清单：myExercises 把题目和 referenceAnswer 一起下发（平台自己给答案，不是破解来的）
async function exercisesOf() {
  const r = await postJson('/gateway/frequent/orgStudentCourse/myExercises', { filters: { courseId: course.id, studentId: me }, pageIndex: 1, pageSize: 100 });
  const recs = (r.data && (r.data.list || r.data.records)) || [];
  const out = [];
  recs.forEach((rec) =>
    (rec.courseCatalogExercisesConfig || []).forEach((e) =>
      out.push({ unitId: e.unitId, exerciseId: e.exerciseId, questionType: e.questionType, content: e.content, answer: e.referenceAnswer, score: e.score, catalog: rec.catalogName, status: rec.statusName })
    )
  );
  return out;
}
async function learnedOf(barrierId) {
  const r = await getJson(`/gateway/system/orgStudent/barrierStudyProgress?barrierId=${barrierId}&studentCourseId=${course.studentCourseId}&version=${course.version}`);
  return r.data || {};
}

// ---------- 播放 ----------
const studyUrl = (v) => `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=${course.id}&studentCourseId=${course.studentCourseId}&version=${course.version}&courseUnitId=${v.unitId}&videoId=${v.videoId}&majorId=${majorId}`;

// URL 上的 videoId 会随播放器自动顺播而更新，这是唯一可靠的「现在在播哪条」判据
async function nowPlaying() {
  return JSON.parse(
    await evl(`(()=>{ const u = new URL(location.href); const v = document.querySelector('video');
      return JSON.stringify({ vid: u.searchParams.get('videoId'), unit: u.searchParams.get('courseUnitId'),
        d: v ? +(v.duration || 0).toFixed(1) : 0, t: v ? +v.currentTime.toFixed(1) : 0,
        paused: v ? v.paused : true, ended: v ? v.ended : false }); })()`)
  );
}
// 起播必须走「可信输入」，而且键盘比坐标点击可靠得多。
// 实测对比（同一门课、同样的 headless 参数、视频都真的在走）：
//   · 直接 v.play()            → 画面推进，但服务端零记录（31 条视频都是这么白播的）
//   · 点画面中心               → 命中的是播放器叠的隐藏 input.d-player-input，控制器不响应
//   · Input.dispatchKeyEvent 空格 → 站点自己的播放器控制器进入播放态，此后每 15 秒发一次
//                                  updateStudyVideoPlan 心跳，并出现 saveStudyVideoPlan 位置上报
// 也就是说心跳挂在控制器的状态机上，不在 <video> 元素上；绕过控制器就等于不记账。
// 用子进程复用 answer-exercises.mjs：整条答题链路（operationId、逐单元释放会话、
// 三种客观题判据分开写）都在那边验证过了，这里不重写一遍，免得两份实现漂移。
async function runAnswerScript(extraArgs) {
  const { spawn } = await import('node:child_process');
  return new Promise((res) => {
    const p = spawn(process.execPath, ['answer-exercises.mjs', '--course', COURSE, ...extraArgs], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    p.stdout.on('data', (d) => { buf += d; });
    p.stderr.on('data', (d) => { buf += d; });
    p.on('exit', (code) => {
      const lines = buf.split(String.fromCharCode(10)).filter((l) => /课程「|已答|可提交|跳过 |提交 |回读 |落库 /.test(l));
      for (const l of lines) log('  [答题] ' + l.trim());
      if (!lines.length) log('  [答题] 没有可报告的输出（exit ' + code + '）：' + buf.replace(/\s+/g, ' ').slice(0, 160));
      // exit 4 = 接口回了 200 但服务端回读没数到那条答案，必须显式喊出来，
      // 否则这条会被"提交 code=200"的日志盖过去、当成成功收工。
      if (code === 4) log('  [答题] ! 有单元回读不达标，见上面标 ✗ 的行');
      res(code);
    });
  });
}

async function trustedStart() {
  const ready = await evl(`(()=>{const v=document.querySelector('video');if(!v)return 'NOVIDEO';v.muted=true;try{v.focus()}catch(e){}return 'ok'})()`)
  if (ready === 'NOVIDEO') return;
  for (const type of ['keyDown', 'keyUp']) {
    await send('Input.dispatchKeyEvent', { type, key: ' ', code: 'Space', text: ' ', windowsVirtualKeyCode: 32 }).catch(() => {});
  }
  await sleep(1600);
  let s = await nowPlaying().catch(() => null);
  if (s && !s.paused) return;
  // 键盘没起来才退回坐标点击（点在播放器容器上，不是画面中心那个隐藏 input）
  const box = JSON.parse(
    await evl(`(() => { const e = document.querySelector('[class*=d-player-control],[class*=player-control],[class*=play-btn],i,[class*=play]') || document.querySelector('video'); if (!e) return '{"x":0,"y":0}'; const r = e.getBoundingClientRect(); return JSON.stringify({x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2)}); })()`)
  );
  if (box.x) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y, buttons: 0 });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1, buttons: 0 });
    await sleep(1600);
    s = await nowPlaying().catch(() => null);
    if (s && !s.paused) return;
  }
  // 最后才是脚本 play()：能让画面动，但不会带来心跳，只用来避免整条流程卡死
  await evl(`(()=>{const v=document.querySelector('video');if(v)v.play().catch(()=>{})})()`);
}
// 标签页在后台时 Chrome 会推迟媒体加载（readyState 恒为 0、duration=NaN），所以必须把自己顶到前台
async function activateTab() {
  try {
    const ver = await (await fetch(BASE + '/json/version')).json();
    const bws = new WebSocket(ver.webSocketDebuggerUrl);
    await new Promise((r) => (bws.onopen = r));
    bws.send(JSON.stringify({ id: 1, method: 'Target.activateTarget', params: { targetId: tab.id } }));
    await new Promise((r) => setTimeout(r, 700));
    bws.close();
  } catch (e) {}
}
// 每换一条视频都把窗口顶到前台 = 每几分钟就把他的屏幕抢走一次（他明确报过这个 bug）。
// Chrome 启动参数里加了 --disable-backgrounding-occluded-windows / --disable-features=CalculateNativeWinOcclusion /
// --disable-renderer-backgrounding / --disable-background-timer-throttling，实测被遮挡窗口 4 秒就 readyState 4、时长正常，
// 所以这里默认**不**碰前台，只有两次都加载不出来才作为最后手段顶一次。
async function softOrActivate(note) {
  // 两轮各等 14 秒。第一轮失败只重新加载页面，仍然不打扰前台。
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < 14; i++) {
      await sleep(1000);
      const d = await evl(`(() => { const v = document.querySelector('video'); return v ? +(v.duration || 0).toFixed(1) : 0; })()`).catch(() => 0);
      if (d > 0) return false;
    }
    if (round === 0) {
      log(`  · ${note || '本页'} 14 秒没出时长，先原地重载再试一次（不顶前台）`);
      await send('Page.reload', { ignoreCache: true });
    }
  }
  if (process.env.ALLOW_FOREGROUND) {
    log(`  ! 两次都没加载出来，按 ALLOW_FOREGROUND 允许顶一次前台（${note || ''}）`);
    await activateTab();
    return true;
  }
  log(`  ! 两轮都没加载出来（${note || ''}）——不抢屏幕是硬要求，这里不顶前台，交给上层换下一条；这行频繁出现说明 Chrome 启动参数丢了`);
  return false;
}
async function gotoStudy(url, note) {
  await send('Page.navigate', { url });
  return softOrActivate(note);
}
// 把窗口挪到屏幕外：他看不到它，但 Chrome 仍按「可见」渲染（实测 off-screen 时 rAF 6 秒 722 帧、
// 时间轴照常推进）。比最小化好——最小化会让页面变成 hidden，媒体和上报行为都可能被改。
async function parkWindow() {
  if (process.env.HAILANG_HEADLESS !== '0') {
    log('无头模式：没有窗口，不需要停放');
    return;
  }
  if (process.env.KEEP_WINDOW_ONSCREEN) return;
  try {
    const ver = await (await fetch(BASE + '/json/version')).json();
    const bws = new WebSocket(ver.webSocketDebuggerUrl);
    const pend = new Map();
    await new Promise((r) => (bws.onopen = r));
    bws.onmessage = (m) => {
      const x = JSON.parse(m.data);
      if (x.id && pend.has(x.id)) {
        const p = pend.get(x.id);
        pend.delete(x.id);
        p(x.result);
      }
    };
    let id = 0;
    const ask = (method, params) => new Promise((r) => { const i = ++id; pend.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
    const w = await ask('Browser.getWindowForTarget', { targetId: tab.id });
    await ask('Browser.setWindowBounds', { windowId: w.windowId, bounds: { left: -30000, top: -30000, width: 1280, height: 800, windowState: 'normal' } });
    bws.close();
    log('窗口已挪到屏幕外（他看不见，但页面按可见渲染）；要看得见请设 KEEP_WINDOW_ONSCREEN=1 重启');
  } catch (e) {
    log('窗口没能挪到屏幕外: ' + e.message);
  }
}
// 换视频优先「点课程目录」而不是整页导航：整页导航会把旧文档连同它还没发出的上报一起销毁。
// ⚠️这里原来的注释引用过一条「只播 60 秒再点目录切走 → 写入成功」的实测，那条样本已作废
// （当时窗口处于 minimized→hidden，媒体被 Chrome 推迟加载，等于没真的播）。
// 目前唯一站得住的判据是 stopPos==片长 才算完成，而程序化播放从未触发过位置上报 —— 点目录是走站点自己流程的入口，值得先修通。
//
// 这个函数历史上成功 0 次，三个真因（前两个是我先前误判为"虚拟化/跨关卡"，实际是）：
//   ① 调用时机太早 —— 导航后 3 秒目录面板还没渲染，直接报"没有这个条目"；所以要等 + 重试
//   ② 整份目录列表在 DOM 里存在两份，取 els[0] 会拿到 display:none 那份，坐标落在视口外
//   ③ 命中测试缺失：坐标上盖着别的元素时，事件发出去是静默打空，日志却显示"点了"
// 返回 true 表示确实切到了目标视频。
async function clickCatalog(v) {
  const probe = `(async () => {
    const want = ('视频：' + ${JSON.stringify(v.name)}).replace(/\\s+/g, '');
    const norm = (e) => (e.textContent || '').replace(/\\s+/g, '');
    const laid = (e) => { const r = e.getBoundingClientRect(); return r.width > 20 && r.height > 5; };
    const vis = (e) => laid(e) && e.getClientRects().length > 0 && e.offsetParent !== null;
    const all = () => [...document.querySelectorAll('div.name')].filter((e) => norm(e).startsWith(want));
    const scroller = (root) => { let p = root; while (p && p !== document.body) { const cs = getComputedStyle(p); if (/auto|scroll/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 4) return p; p = p.parentElement; } return null; };
    let els = all().filter(vis);
    let usedHidden = false;
    if (!els.length && all().some(laid)) { els = all().filter(laid); usedHidden = true; }
    if (!els.length) return JSON.stringify({ ok: false, why: 'not-yet', total: document.querySelectorAll('div.name').length });
    // el-loading-mask 是 Element Plus 的加载遮罩，盖满整个面板。事件打进它就静默丢失，
    // 必须先等它消失 —— 实测「点了目录但没切到目标」17 次全是这个原因。
    for (let i = 0; i < 10; i++) {
      const m = [...document.querySelectorAll('.el-loading-mask,[class*=loading-mask]')].find((x) => { const s = getComputedStyle(x); return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.05 && x.getBoundingClientRect().height > 40; });
      if (!m) break;
      await new Promise((r) => setTimeout(r, 900));
    }
    const e = els[0];
    const cont = scroller(e.parentElement);
    if (cont) { const br = cont.getBoundingClientRect(), rr = e.getBoundingClientRect(); cont.scrollTop += rr.top + rr.height / 2 - (br.top + br.height / 2); }
    else { const rr = e.getBoundingClientRect(); window.scrollBy(0, rr.top + rr.height / 2 - innerHeight / 2); }
    await new Promise((r) => setTimeout(r, 300));
    const r = e.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight) return JSON.stringify({ ok: false, why: '滚完还是不在视口内', top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight });
    const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
    const top = document.elementFromPoint(cx, cy);
    if (!top || !(top === e || e.contains(top) || top.contains(e))) return JSON.stringify({ ok: false, why: '这个坐标上盖着别的元素', hit: top ? top.tagName + '.' + String(top.className).slice(0, 28) : 'null', cx, cy });
    return JSON.stringify({ ok: true, cx, cy, dup: all().length, shown: els.length, hidden: usedHidden });
  })()`;
  try {
    let b = null;
    for (let round = 0; round < 6; round++) {
      b = JSON.parse(await evl(probe));
      if (b.ok) break;
      if (b.why !== 'not-yet') break;
      await sleep(3000);
    }
    if (!b.ok) {
      log(`  · 点目录失败：${b.why === 'not-yet' ? `等了 18 秒目录仍未渲染（页面共 ${b.total} 个 div.name）` : b.why}${b.top !== undefined ? ` top=${b.top} bottom=${b.bottom} 视口高=${b.vh}` : ''}${b.hit ? ` 盖住的是 ${b.hit} @(${b.cx},${b.cy})` : ''}`);
      return false;
    }
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', { type, x: b.cx, y: b.cy, button: type === 'mousePressed' ? 'left' : 'none', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
    }
    // 目录切换是 SPA 内部改路由，URL 上的 videoId 可能几秒后才跟上；
    // 所以除了认 videoId，也认「播放器换成了目标时长」这个特征，避免 URL 不更新时误判成失败。
    for (let i = 0; i < 6; i++) {
      await sleep(2000);
      const s = await nowPlaying().catch(() => null);
      if (!s) continue;
      if (s.vid === v.videoId) return true;
      if (v.seconds && s.d && Math.abs(s.d - v.seconds) < 3 && s.vid !== v.videoId) {
        log(`  · 目录切换后播放器时长对上了(${Math.round(s.d)}s≈${v.seconds}s)但 videoId 还没跟上，再等一轮`);
      }
    }
    const cur = await nowPlaying().catch(() => null);
    log(`  · 点了目录但没切到目标：期望 ${v.videoId.slice(0, 10)}… 实际 ${cur ? String(cur.vid).slice(0, 10) + '…' : '读不到'} @(${b.cx},${b.cy}) 该条目 DOM 里 ${b.dup} 份、可见 ${b.shown} 份`);
    return false;
  } catch (e) {
    log('  · 点目录异常：' + String(e.message).slice(0, 120));
    return false;
  }
}
// 走到目标视频：先补一次「关闭上一条监控会话」的上报，再点目录，点不动才整页导航。
// 为什么要主动补：学习记录是在 updateEndTime 关闭监控会话时才落库的，而整页导航会把旧文档销毁、
// 这个请求就丢了 —— 实测「播满 881 秒后 URL 导航走」无记录，「只播 60 秒后点目录切走」却写入了。
async function closeMonitor() {
  try {
    const r = await evl(`fetch('/gateway/study/studyRecordVideoMonitor/updateEndTime',{headers:{Authorization: localStorage.getItem('token2')}}).then(x=>x.status)`);
    await sleep(1200);
    return r;
  } catch (e) {
    return 'ERR';
  }
}
async function goToVideo(v, note) {
  const code = await closeMonitor();
  if (code !== 200) log(`  · 关闭上一条监控会话返回 ${code}`);
  if (await clickCatalog(v)) {
    log(`  · 点目录切到 ${v.name}${note ? '（' + note + '）' : ''}`);
    return 'clicked';
  }
  await gotoStudy(studyUrl(v), v.name);
  return 'navigated';
}
const markDone = (v, secs) => {
  state.done[v.videoId] = { at: new Date().toISOString(), name: v.name, seconds: secs > 0 ? secs : v.seconds, unitId: v.unitId };
  save();
};

// 一个关卡内：信任播放器的自动顺播，只在当前这条不在待办里时才主动导航
async function watchBarrier(vids) {
  const todo = new Map();
  vids.filter((v) => !state.done[v.videoId]).forEach((v) => todo.set(v.videoId, v));
  if (!todo.size) {
    log('  本关卡视频已全部完成');
    return;
  }
  const failed = [];
  let s = await nowPlaying().catch(() => null);
  if (!s || !todo.has(s.vid)) {
    const first = [...todo.values()][0];
    log(`  → 进入 ${first.name}`);
    await goToVideo(first, '进入关卡');
    s = await waitPlayable();
  }
  // 逐条兜底：当前这条迟迟不出时长就单独跳过它，不要放弃整关卡
  while (todo.size) {
    s = await nowPlaying().catch(() => null);
    if (s && s.vid && !(s.d > 0)) {
      // gotoStudy 已经等过两轮（含一次原地重载），这里只再给一次不碰前台的读时长机会
      s = (await waitPlayable()) || s;
    }
    if (s && s.vid && !(s.d > 0)) {
      const cur = todo.get(s.vid);
      log(`  ? ${cur ? cur.name : s.vid} 确认无时长，主动换下一条`);
      if (cur) {
        todo.delete(s.vid);
        failed.push(cur);
      }
      const nx = [...todo.values()][0];
      if (!nx) break;
      await goToVideo(nx);
      s = await waitPlayable();
      if (!s) break;
      continue;
    }
    break;
  }
  if (!s || !(s.d > 0)) {
    log('  ! 没有任何可播视频，本关卡结束');
    return;
  }

  async function waitPlayable() {
    // 播放器不预加载：必须先来一次真实点击，媒体才开始拉元数据（否则 duration 恒为 0）
    let cur = null;
    for (let i = 0; i < 20; i++) {
      await sleep(1500);
      cur = await nowPlaying().catch(() => null);
      if (cur && cur.vid) break;
    }
    await trustedStart();
    for (let i = 0; i < 40; i++) {
      await sleep(1500);
      cur = await nowPlaying().catch(() => null);
      if (cur && cur.d > 0 && !cur.paused) return cur;
      if (i % 8 === 7) await trustedStart();
    }
    return cur;
  }
  let prev = null, lastT = -1, stuck = 0, nearEnd = false;
  for (let guard = 0; guard < 5000 && todo.size; guard++) {
    s = await nowPlaying().catch(() => null);
    if (!s) {
      await sleep(3000);
      continue;
    }
    if (prev && s.vid !== prev && todo.has(prev)) {
      const v = todo.get(prev);
      if (nearEnd) {
        markDone(v, v.seconds);
        todo.delete(prev);
        log(`  ✓ 播完 ${v.name}（本关卡剩 ${todo.size} 条）`);
      } else {
        // 只是切走了但没看到片尾 —— 不能算完成，留在待办里回头补
        log(`  ? ${v.name} 未看到片尾就切走了，保留在待办（当前 ${s.t}/${s.d}s）`);
      }
      nearEnd = false;
    }
    if (todo.has(s.vid) && (s.ended || (s.d > 0 && s.t >= s.d - 1.5))) nearEnd = true;
    if (s.ended && todo.has(s.vid)) {
      const v = todo.get(s.vid);
      markDone(v, v.seconds);
      todo.delete(s.vid);
      nearEnd = false;
      log(`  ✓ 播完(ended) ${v.name}，剩 ${todo.size} 条`);
      prev = null;
      continue;
    }
    // 这个播放器到片尾是在原地重播：不换 videoId，ended 也抓不住（2 秒一轮刚好跳过去）。
    // 只认「上一轮还在片尾 30 秒内、这一轮掉回开头」这一个特征——中途续播和主动重载都是往前跳，不会命中。
    if (s.vid === prev && todo.has(s.vid) && lastT >= 0 && s.d > 0 && s.t < lastT - 10 && lastT >= s.d - 30) {
      const v = todo.get(s.vid);
      markDone(v, v.seconds);
      todo.delete(s.vid);
      nearEnd = false;
      log(`  ✓ 播完(片尾后原地重播) ${v.name}，剩 ${todo.size} 条`);
      prev = null;
      lastT = -1;
      continue;
    }
    if (todo.size && !todo.has(s.vid)) {
      const nx = [...todo.values()][0];
      log(`  → 主动导航到 ${nx.name}`);
      await goToVideo(nx, '未播到片尾就切走了');
      prev = null;
      lastT = -1;
      await sleep(6000);
      continue;
    }
    if (s.paused) await trustedStart();
    if (s.vid === prev && lastT >= 0 && Math.abs(s.t - lastT) < 0.2) stuck++;
    else stuck = 0;
    if (stuck > 35) {
      log(`  ! 卡住超过 70s（${s.vid} @${s.t}s），强制导航`);
      const nx = [...todo.values()][0];
      await goToVideo(nx, '卡住后换下一条');
      prev = null;
      lastT = -1;
      stuck = 0;
      await sleep(6000);
      continue;
    }
    lastT = s.t;
    prev = s.vid;
    if (guard % 30 === 0) log(`  · ${(todo.get(s.vid) || {}).name || s.vid} ${s.t}/${s.d}s`);
    await sleep(2000);
  }
}

// 非闯关制课程：listCourseBarrier 返回空，只能按目录节点枚举。
// 这类课的 URL 不会补出 videoId，所以身份用「视频：<名称>」标签，完成判据用片尾。
async function watchNodes() {
  const tree = await postJson('/gateway/study/courseCatalog/tree', { courseId: course.id });
  const nodes = [];
  const walk = (n) => (n.childList || []).forEach((c) => { if ((c.videoCount || 0) > 0) nodes.push({ unitId: c.id, name: c.name || c.sortName || c.id, videoCount: c.videoCount }); walk(c); });
  walk(tree.data || {});
  log(`非闯关制：按目录节点枚举到 ${nodes.length} 个含视频的节点`);
  for (const nd of nodes) {
    const key = `unit:${nd.unitId}`;
    if (state.done[key]) {
      log(`  = 跳过已完成 ${nd.name}`);
      continue;
    }
    log(`  → 进入节点 ${nd.name}（含 ${nd.videoCount} 支）`);
    await gotoStudy(`https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=${course.id}&studentCourseId=${course.studentCourseId}&version=${course.version}&courseUnitId=${nd.unitId}&majorId=${majorId}`, nd.name);
    let s = null;
    for (let i = 0; i < 25; i++) {
      await sleep(2000);
      s = await nodeState();
      if (s && s.d > 0) break;
    }
    if (!s || !(s.d > 0)) {
      log(`  ! ${nd.name} 拿不到可播源，记为已尝试`);
      state.done[key] = { at: new Date().toISOString(), name: nd.name, skipped: true };
      save();
      continue;
    }
    await trustedStart();
    const seenLabels = new Set();
    let done = false;
    for (let i = 0; i < 400; i++) {
      await sleep(2000);
      s = await nodeState();
      if (!s) continue;
      if (s.paused) await trustedStart();
      if (s.label) seenLabels.add(s.label);
      const atEnd = s.ended || (s.d > 0 && s.t >= s.d - 1.5);
      if (atEnd) {
        // 一个节点可能挂多支视频：播放器会自动接下一支，所以先观察一段，标签/时长变了就说明还没播完
        const before = s.label + '|' + s.d;
        let advanced = false;
        for (let k = 0; k < 8; k++) {
          await sleep(2000);
          const n = await nodeState();
          if (n && n.label + '|' + n.d !== before) {
            advanced = true;
            s = n;
            break;
          }
        }
        if (!advanced) {
          done = true;
          break;
        }
        continue;
      }
      if (i % 30 === 29) log(`  · ${s.label || nd.name} ${s.t}/${s.d}s（已见 ${seenLabels.size}/${nd.videoCount} 支）`);
    }
    if (!done && seenLabels.size >= nd.videoCount) done = true;
    state.done[key] = { at: new Date().toISOString(), name: nd.name, seconds: Math.round(s ? s.d : 0), complete: done };
    save();
    log(`  ${done ? '✓ 播完' : '⏱ 超时'} ${nd.name}`);
  }
}
async function nodeState() {
  return JSON.parse(
    await evl(`(()=>{ const v = document.querySelector('video'); if (!v) return 'null';
      return JSON.stringify({ d: +(v.duration || 0).toFixed(1), t: +v.currentTime.toFixed(1), paused: v.paused, ended: v.ended,
        label: (document.body.innerText.match(/视频：[^\\s]{0,30}/) || [''])[0] }); })()`)
  );
}

const allEx = await exercisesOf();
log(`练习清单=${allEx.length} 道（状态：${[...new Set(allEx.map((e) => e.status))].join('/') || '空'}）`);

if (DRY) {
  if (!bList.length) {
    const tree = await postJson('/gateway/study/courseCatalog/tree', { courseId: course.id });
    const nodes = [];
    const walkD = (n) => (n.childList || []).forEach((c) => { if ((c.videoCount || 0) > 0) { const k = `unit:${c.id}`; nodes.push({ name: c.name, videoCount: c.videoCount, done: !!state.done[k] }); } walkD(c); });
    walkD(tree.data || {});
    log(`非闯关制：${nodes.length} 个含视频节点（本地已完成 ${nodes.filter((n) => n.done).length}）`);
    process.exit(0);
  }
  for (const b of bList) {
    const vids = await videosOf(b.id);
    const dn = vids.filter((v) => state.done[v.videoId]).length;
    log(`关卡「${b.name}」视频 ${vids.length} 条(本地已完成 ${dn}) / ${Math.round(vids.reduce((a, v) => a + v.seconds, 0) / 60)} 分钟，练习 ${allEx.filter((e) => vids.some((v) => v.unitId === e.unitId)).length} 道`);
  }
  process.exit(0);
}

if (!bList.length) {
  log('非闯关制课程：走目录节点枚举');
  await watchNodes();
  const det = await getJson(`/gateway/system/orgStudent/myCourseDetails?studentId=${me}&id=${course.id}&majorId=${majorId}&studentCourseId=${course.studentCourseId}&version=${course.version}`);
  const dx = det.data || {};
  log(`结束。任务 ${dx.haveUnit}/${dx.sumUnit}，时长 ${dx.haveTime}/${dx.sumTime}，练习 ${dx.haveExercises}/${dx.sumExercises}`);
  ws.close();
  process.exit(0);
}

for (const b of bList) {
  if (ONLY_BARRIER && b.name !== ONLY_BARRIER) continue;
  const vids = await videosOf(b.id);
  const before = await learnedOf(b.id);
  log(`关卡「${b.name}」视频 ${vids.length} 条，服务端已学 ${before.haveLearned}/${vids.length}`);
  await watchBarrier(vids);
  let after = await learnedOf(b.id);
  if ((after.haveLearned || 0) < vids.length) {
    log(`  ↻ 服务端只认 ${after.haveLearned}/${vids.length}，再补一轮（只补本地还没记的）`);
    await watchBarrier(vids);
    after = await learnedOf(b.id);
  }
  // 逐条核对：本地记完、但服务端 studyVideoStatus 不是 2 的，退回等下次再补。
  // 刻意不再「整关卡作废 + 当场重播」：那会让同一批视频被反复重烧（实测白烧过 7 小时）。
  // 只留 5 分钟宽限，够吸收"刚播完心跳还没落库"的窗口。
  // 原来这里是 12 小时，理由写的"服务端有延迟批处理"——那个解释是错的：
  // 播了不记账的真实原因是起播用了 v.play() 没让站点播放器组件进入播放态（见 trustedStart 的注释）。
  // 宽限期太长会把那 31 条白播的视频一直卡在"本地已完成"里，永远等不到用正确方式重播。
  const GRACE = 5 * 60 * 1000;
  const notYet = (await videosOf(b.id)).filter((v) => state.done[v.videoId] && v.videoStatus !== 2);
  const unacked = notYet.filter((v) => Date.now() - new Date(state.done[v.videoId].at).getTime() > GRACE);
  const inGrace = notYet.length - unacked.length;
  if (inGrace > 0) log(`  ⏳ ${inGrace} 条播完但服务端还没记，5 分钟宽限期内先不退回`);
  if (unacked.length) {
    unacked.forEach((v) => delete state.done[v.videoId]);
    save();
    log(`  ! ${unacked.length} 条本地记完但服务端不认（例：${unacked.slice(0, 3).map((v) => v.name).join('、')}）→ 已退回，留到下次补，不当场重播`);
  }
  const final = await learnedOf(b.id);
  log(`关卡「${b.name}」→ 服务端已学 ${final.haveLearned}/${vids.length}，练习 待做${final.unpracticed}/已做${final.havepracticed}，未通过 ${final.unpassExercises}`);
}
// 收尾判据必须以服务端为准，不能看本地计数。
// 之前这里无条件 log「结束。累计完成视频 N 条」+ exit 0，而 N 是本地 state.done 的条数 ——
// 实测导致 runner 在服务端只记了 02:36:43/08:20:21 的时候就说「课程播放完成」并以 0 退出，
// 守护进程据此收工，剩下三分之二的课再没人播。
const allServer = [];
for (const b of bList) allServer.push(...(await videosOf(b.id)));

// 补播关卡接口没覆盖到的条目。放在终态判据之前：这一轮就能把它播掉，而不是等下一轮。
const covered = new Set(allServer.map((v) => v.videoId));
const tree = await progressVideos();
const extra = tree.filter((v) => v.videoId && !covered.has(v.videoId));
if (extra.length) {
  log(`权威目录树 ${tree.length} 条，关卡接口只覆盖 ${covered.size} 条 → 补播 ${extra.length} 条：${extra.map((v) => v.name).join('、')}`);
  await watchBarrier(extra);
} else if (tree.length && tree.length !== covered.size) {
  log(`! 树里 ${tree.length} 条、关卡覆盖 ${covered.size} 条，但差集为空（应为同一条目的不同表示）`);
}

const notDone = allServer.filter((v) => v.videoStatus !== 2);
if (notDone.length) {
  notDone.forEach((v) => delete state.done[v.videoId]);
  save();
  log(`✗ 服务端仍有 ${notDone.length}/${allServer.length} 条未记为完成（例：${notDone.slice(0, 3).map((v) => v.name).join('、')}）→ 已退回本地标记，以退出码 3 让守护再来一轮`);
  ws.close();
  process.exit(3);
}
// 最后一道闸：课程级时长。只看 allServer 全绿就收工，会被"关卡接口少给一条"打穿 ——
// 实测带着 08:17:18/08:20:21 的缺口报了「服务端确认 40 条视频全部已完成」并以 0 退出。
// 允许 2 秒以内的差，避免平台侧取整造成永远对不齐、守护无限重跑。
const toSec = (t) => String(t || '0:0:0').split(':').reduce((a, p) => a * 60 + (parseInt(p, 10) || 0), 0);
const courseDet = await getJson(`/gateway/system/orgStudent/myCourseDetails?studentId=${prof.studyNumber}&id=${course.id}&majorId=${majorId}&studentCourseId=${course.studentCourseId}&version=${course.version}`);
const cd = courseDet.data || {};
const gap = toSec(cd.sumTime) - toSec(cd.haveTime);
if (cd.sumTime && gap > 2) {
  // 只有"确实还有能播的东西"才退回下一轮。像 软件工程 那样只差 11 秒、而权威树里也没有
  // 未覆盖的单元时，exit 3 只会让守护空烧到重启上限。
  // 走到这里说明关卡视频已全部 status=2（notDone 分支已在前面 exit 3），
  // 所以唯一还能动的就是本轮刚补播的那批。
  if (extra.length > 0) {
    log(`✗ 课程时长 ${cd.haveTime}/${cd.sumTime}，还差 ${gap} 秒（本轮补播了 ${extra.length} 条，可能还没落库）→ 退出码 3 让守护再补一轮`);
    ws.close();
    process.exit(3);
  }
  log(`! 课程时长 ${cd.haveTime}/${cd.sumTime} 差 ${gap} 秒，但关卡全部 status=2、权威树也没有未覆盖单元 —— 这缺口不归因于"漏播"，报出来收工，不让守护空烧`);
}
if (ANSWER) {
  log('全部视频已记账，开始做客观题');
  await runAnswerScript(APPLY_ANSWER ? ['--apply'] : []);
} else {
  log('（没加 --answer，本轮只刷视频不做题）');
}
log(`结束。服务端确认 ${covered.size + extra.length} 条视频已完成，课程时长 ${cd.haveTime}/${cd.sumTime}${gap > 0 ? '（差 ' + gap + ' 秒，在容差内）' : ''}`);
ws.close();
process.exit(0);
