// ==UserScript==
// @name         海浪智学 · 任务面板
// @namespace    local.hailang.autocourse
// @version      0.4.3
// @description  学生端任务面板：看账号与每门课缺口、勾选课程排队刷、默认静音+2倍速、切窗口/切标签被停会自动接手，并把「服务端到底记没记账」直接显示出来
// @author       hailang-user
// @match        https://study.cqie.edu.cn/stu/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

/*
 * v0.4.3 把 v0.4.2 那条"跳回视频页"真正接通：列表页上面板体被藏掉了，
 *   而常驻注入器又只在学习页注入 —— 结果人停在 /MyCourse/Paged 时既看不到面板也等不到注入，
 *   实测卡 140 秒不动。现在只要还在 /stu/ 下就显示面板，注入器也改成认整个站点。
 *
 * v0.4.2 修「点绿按钮没反应、也不知道有没有在刷」。两条根因：
 *   ① 站点是 SPA：从视频页点进课程列表页，URL 变了但脚本不会重跑，加载时算好的 STUDY 过期了。
 *      于是面板在列表页上照常显示课程与队列，可页面上根本没有 <video>，自动起播的看门狗永远不触发。
 *   ② 点「开始」时队列 id 和已有任务相同就直接 return（防重复排队那条），
 *      结果"该跳转"的情况也被一起挡掉 —— 他连点九下，日志刷了九条「队列没变」。
 *   现在：需要看页面的判断一律重新读 location（onStudy()）；有任务但这一页没视频 → 自己跳回待播那条；
 *   按钮文案分成三态（正在播 第x/y条 / 停着呢点我 / 不在视频页正在跳回去），不再用"正在刷"糊人。
 *
 * v0.4.1 对着他两条新反馈改：
 *   ① 片尾弹「知识点：… 有习题：(2题) 待完成」会卡住播放 —— 面板现在每 3 秒查一次可见弹窗，
 *      点它的关闭按钮（绝不点「去练习」，那会跳去做题），并且到片尾**自己跳下一条**，
 *      不再指望站点顺播（runner 之所以从没撞上这个框，是因为它每条视频都整页导航）。
 *   ② "经常声音外放"：轮询是 1.2 秒一次，而站点在起播那一刻就把 muted 设回 false ——
 *      那 1.2 秒就是外放。改成在 play / volumechange 事件里当场按回去。
 *   ③ 待播判据改用每条视频自己的 haveTime（见 openNext 上方注释），关卡接口退为兜底。
 *
 * v0.4.0 撤回一条我说错了两轮的结论：「起播必须真人点一下」是**我点错了元素**，不是 Chrome 拦的。
 *   站点播放键 .d-play-btn 被一层透明的 INPUT.d-player-input 盖着，事件打在 .d-play-btn 自己身上
 *   进不了播放器组件的状态机；打在 document.elementFromPoint 命中的那个元素上就进得去。
 *   定量验证（.cdp/hb-resp.mjs，账号 CLASSMATE_ACCOUNT，【前端框架开发技术】「使用路由守卫-1」）：
 *   只给合成手势、全程零可信输入，60 秒内服务端 haveTime +90 秒（= 2 倍速看满 60 秒），
 *   updateStudyVideoPlan 全部 HTTP 200 操作成功。所以面板改成**自己起播**（页面上有开关）。
 *   顺带两个坑，之前就是它们把我带偏的：①「课程介绍」这类视频发了心跳也不计进 haveTime；
 *   ②haveTime 到顶的视频再播也不涨。对账必须挑普通视频 + 有缺口的课，别拿它当"面板坏了"的证据。
 *
 * v0.3.4 针对「装了最新还是切窗口就停」补的三件事（用户自己的 Chrome，没有我那四个豁免参数）：
 *   ① 声音改三态：静音 / 微声保活（音量 0.02）/ 开。Chrome 只给**正在发声**的标签豁免
 *      定时器节流与内存节省挂起，纯静音视频在后台会被整个当后台处理 —— 这时候面板自己的
 *      脚本也一起被冻住，任何续播逻辑都跑不到。要挂后台请用「微声保活」。
 *   ② 加了自证仪表：页脚「接手 / 暂停事件 / 定时器最大迟到」三个数，能把
 *      「判据没认对」和「页面被冻了」分开；日志里同一条重复消息折成 ×N。
 *   ③ 版本写进标题栏并在加载时打一条日志，避免"改了没生效"和"生效了但没用"混成一件事。
 *
 * v0.3.3 治「切一个窗口视频就停」。取证结论：
 *   暂停是站点播放器自己按的（窗口失焦即 pause），而 v0.3.2 的自动接手有两道门把它挡住了：
 *   ① 判据要求 reallyHidden() 为真 —— 但只是切窗口、没被完全遮挡时 Chrome 仍认为页面 visible，于是直接 return；
 *   ② 接手走 setTimeout(400)，页面被当后台时定时器被节流，这一下会迟到。
 *   现在不分 hidden 与否，只要不是他三秒内亲手碰过播放器，就在同一个 pause 事件里同步 play()。
 *   页脚新增「自动接手」计数，接手原因（页面被切走/窗口失焦）打进日志，下次截图就能直接对上账。
 *
 * v0.3.0 补三条：勾选不再被刷新冲掉、完成状态改从关卡接口取、时长每 60 秒自取。
 *
 * 已判掉的问题（真人点一次之后会自己续上吗？）：会。
 *   实测 同学A账号，只点了一次播放键，此后 构建Vue的应用实例-2 播完、站点自己顺播到
 *   存储和显示Vue的数据-1 并继续播，期间窗口还被最小化过一次；
 *   心跳累计从 39 涨到 81，服务端 haveTime 从 00:13:27 涨到 00:32:38（+1151 秒）。
 *   所以面板的定位是「你点一下起播，剩下它管」，不是「全自动」。
 *
 * v0.2.0 对着七条反馈改：
 *   ① 勾选多门课 → 排队，一次只刷一门，当前那门标「正在刷」，刷完自动进下一门
 *      （站点是单会话，开两个窗口只会互相顶号，所以只能串行）
 *   ② 面板只允许一个实例（上一版装了两个脚本副本就会画两个）
 *   ③ 全程不调 window.focus()、不 alert，绝不把窗口抢到前台
 *   ④ 点「开始」必须有反馈：显示当前第几门第几条，并显示服务端时长涨了多少
 *   ⑤ 默认静音，另给「声音」开关
 *   ⑥ 切到别的标签再切回来不再暂停（伪装可见性 + 只补真被切走时的那次暂停）
 *   ⑦ 判「有没有记账」不数请求 —— 直接比服务端 haveTime，请求节奏是我猜的，时长是它自己认的账
 *
 * 播放内核与 hailang-background-play.user.js 同源（那套逻辑是 CDP 通道实测出来的）。
 * 起播那一下在 v0.4.0 之前写成"必须挂在用户真实手势上"，那是错的（见上面 v0.4.0 段）：
 * 打在真正会被点到的元素上的合成手势就够，站点服务端照样记账。
 */
(() => {
  'use strict';

  const STUDY = /\/stu\/pages\/MyCourse\/Study/.test(location.pathname);
  // 站点是 SPA：从视频页点进课程列表页时 URL 变了，但脚本不会重跑，所以 STUDY 会过期。
  // 凡是判断"现在这一页到底是什么页"的地方，都要重新读 location，别用加载时算好的常量。
  const onStudy = () => /\/stu\/pages\/MyCourse\/Study/.test(location.pathname);
  const JOB_KEY = 'kg-job';

  // ---------- ② 单例 ----------
  if (window.__kgPanel) { console.log('[任务面板] 已有实例，本次不重复注入'); return; }
  window.__kgPanel = { version: '0.4.3' };
  const dedupe = () => {
    const all = document.querySelectorAll('#kg-panel');
    for (let i = 1; i < all.length; i++) all[i].remove();
    return all.length > 0;
  };

  const G = {
    list: [], queue: [], cur: null, beats: 0, monitor: 0, mode: 'mute', autoStart: true,
    running: false, baseHave: 0, log: [], waiting: false, late: 0,
  };
  window.__kgPanel.G = G;   // 给自检脚本读数用（面板自己不依赖它）

  // 同一条消息重复出现时折成「×N」，不要把它刷满屏。
  // 实测：橙色等待态下他连点几下，日志整屏都是「队列没变」，真正要看的接手/心跳信息被顶掉了。
  const say = (m) => {
    const el = document.getElementById('kg-log');
    if (m === G.lastMsg) {
      G.dupN = (G.dupN || 1) + 1;
      G.log[G.log.length - 1] = G.lastLine + ' ×' + G.dupN;
      if (el) el.textContent = G.log.join('\n');
      return;
    }
    G.lastMsg = m; G.dupN = 1;
    G.lastLine = `[${new Date().toTimeString().slice(0, 8)}] ${m}`;
    G.log.push(G.lastLine);
    if (G.log.length > 60) G.log.shift();
    if (el) el.textContent = G.log.join('\n');
  };

  // ---------- ⑦ 探针：fetch 和 XHR 都要包 ----------
  // 上一版只包 window.fetch，而站点用 axios（浏览器里是 XHR），心跳被量成恒 0，差点判错方案。
  const rawFetch = window.fetch;
  window.fetch = function (input) {
    try {
      const u = typeof input === 'string' ? input : (input && input.url) || '';
      if (u.includes('updateStudyVideoPlan')) G.beats++;
      if (u.includes('studyRecordVideoMonitor')) G.monitor++;
    } catch (e) { /* 探针不能影响请求 */ }
    return rawFetch.apply(this, arguments);
  };
  const openOrig = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) {
    try {
      const s = String(u || '');
      if (s.includes('updateStudyVideoPlan')) G.beats++;
      if (s.includes('studyRecordVideoMonitor')) G.monitor++;
    } catch (e) { }
    return openOrig.apply(this, arguments);
  };

  // ---------- 起播手势（v0.4.1 的关键修正） ----------
  // 之前我判「脚本代点不计时长、必须真人点一下」，那是**点错了元素**：
  // 播放键 .d-play-btn 被一层透明的 INPUT.d-player-input 盖着，document.elementFromPoint
  // 在播放键中心命中的是那个 INPUT，事件打在 .d-play-btn 自己身上就进不了播放器组件的状态机。
  // 打在"真正会被点到的那个元素"上之后：只给合成手势、不给任何可信输入，
  // 60 秒内服务端 haveTime +90 秒（= 2 倍速看满 60 秒），updateStudyVideoPlan 全部 HTTP 200 操作成功。
  // 实测环境：账号 CLASSMATE_ACCOUNT、【前端框架开发技术】「使用路由守卫-1」（.cdp/hb-resp.mjs）。
  const fireAll = (el, x, y) => {
    for (const t of ['pointerover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const E = t.startsWith('pointer') ? PointerEvent : MouseEvent;
      try { el.dispatchEvent(new E(t, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y })); } catch (e) { }
    }
  };
  function fireGesture() {
    const v = document.querySelector('video');
    if (!v) return '这一页没有视频';
    const b = document.querySelector('.d-play-btn, [class*=play-btn]') || v;
    const r = b.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy) || b;
    // 命中的东西必须真在播放器里。实测视频播完时站点会盖一层 el-overlay-message-box，
    // 手势打在遮罩上等于白打（页面上看起来"停着不动"），所以那种情况改成点掉弹窗的确认按钮。
    if (!(hit.closest && hit.closest('video, [class*=player], [class*=play]'))) {
      const OK = /继续|下一|确定|确认|立即|播放/;
      // 只认站点弹窗里的按钮，且必须排除面板自己 —— 上一版这里带了裸 button，结果匹配到面板的
      // 「立即起播」，等于自己点自己，日志里冒出一堆对账行，视频却一直没动。
      const btns = [...document.querySelectorAll('.el-message-box__btns button, .el-message-box button, .el-dialog__footer button, .el-overlay button')]
        .filter((x) => !(x.closest && x.closest('#kg-panel')));
      const t = btns.find((x) => OK.test((x.textContent || '').trim()) && x.getBoundingClientRect().width > 0);
      if (t) {
        const tr = t.getBoundingClientRect();
        fireAll(t, tr.left + tr.width / 2, tr.top + tr.height / 2);
        return `点掉弹窗按钮「${(t.textContent || '').trim().slice(0, 10)}」（播放器被 ${hit.tagName}.${String(hit.className).slice(0, 22)} 盖住）`;
      }
      setTimeout(() => { if (v.paused) v.play().catch(() => { }); }, 600);
      return `播放器被 ${hit.tagName}.${String(hit.className).slice(0, 22)} 盖住且没有可点的确认按钮`;
    }
    fireAll(hit, cx, cy);
    setTimeout(() => { if (v.paused) v.play().catch((e) => say('play() 被拒：' + e.name)); }, 900);
    return `${hit.tagName}.${String(hit.className).slice(0, 26)}`;
  }
  // 「这次暂停是不是他亲手点的」——判据不能用「页面是否 hidden」（见下面 ⑥），也不能被 hidden 挡住
  const resumable = (v) => {
    if (!v || v.tagName !== 'VIDEO') return false;
    if (Date.now() - (v.__kgUserAt || 0) < 3000) return false;                // 他刚碰过播放器，这次暂停是他的意图
    if (v.duration && v.currentTime >= v.duration - 0.5) return false;        // 播到片尾，别原地复活
    return true;
  };

  // ---------- ⑥ 切窗口/切标签被停：判据从「页面是否 hidden」换成「是不是他亲手点的」 ----------
  // v0.3.2 那版把自动续播建在 reallyHidden() 上，两处漏：
  //   a) 切「窗口」时 Chrome 常常还没把页面判成 hidden（只是失焦、没被完全遮挡），而站点播放器
  //      已经因为 blur 自己 pause 了；我们的监听却因为 !reallyHidden() 直接 return，
  //      表现就是「一切到别的窗口视频就停，切回来才动」。
  //   b) 续播走 setTimeout(400)。页面被 Chrome 当成后台时定时器会被节流（不发声的页面更狠），
  //      这一下可能几秒甚至更久之后才跑。
  // 所以现在不分 hidden 与否：只要这次 pause 不是他三秒内亲手碰过播放器，就在同一个事件里同步
  // play()（同步调用不受定时器节流影响），定时器只做兜底重试。
  if (STUDY) {
    const dH = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    const dV = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
    const reallyHidden = () => (dH && dH.get ? !!dH.get.call(document) : !!document.hidden);
    try {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    } catch (e) { console.warn('[任务面板] 可见性伪装失败', e); }

    // 「他亲手碰了播放器」必须只算播放器区域。上一版把任何 pointerdown 都记成用户意图，
    // 于是点面板自己的按钮也会把自动接手压住 3 秒。
    const inPlayer = (t) => {
      try { return !!(t && t.closest && t.closest('video, .dplayer, [class*=player], [class*=play], [class*=control]')); } catch (e) { return false; }
    };
    const markUser = (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('#kg-panel')) return;
      if (e.type === 'keydown') {
        if (!/^( |k|K|p|P)$/.test(e.key)) return;
        if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      } else if (!inPlayer(t)) return;
      const v = document.querySelector('video');
      if (v) v.__kgUserAt = Date.now();
    };
    document.addEventListener('pointerdown', markUser, true);
    document.addEventListener('keydown', markUser, true);

    document.addEventListener('pause', (e) => {
      const v = e.target;
      if (!v || v.tagName !== 'VIDEO') return;
      G.pauseSeen = (G.pauseSeen || 0) + 1;
      if (!resumable(v)) {
        if (Date.now() - (v.__kgUserAt || 0) < 3000) say('  检测到暂停·判为你亲手点的（3 秒内碰过播放器），不接手');
        return;
      }
      const why = reallyHidden() ? '页面被切走' : '窗口失焦';
      G.pauses = (G.pauses || 0) + 1;
      // 接手也要发起播手势，不能只 v.play()：纯 play() 只动画面，组件状态机还停在"暂停"，
      // 实测 20 秒零心跳；发起播手势才会继续上报。
      const hit = fireGesture();
      if (G.pauses <= 12) say(`  已自动接手第 ${G.pauses} 次（${why}，手势打在 ${hit} 上）`);
      clearTimeout(v.__kgResume);
      v.__kgResume = setTimeout(() => { if (v.paused && resumable(v)) fireGesture(); }, 2000);
    }, true);
    // 静音必须**当场**生效，不能等 1.2 秒的轮询：站点在起播那一刻会把 muted 设回 false，
    // 那 1.2 秒就是他听到的"突然外放"。所以在 play/volumechange 事件里当场按回去。
    const clampSound = (e) => {
      const el = e.target;
      if (!el || (el.tagName !== 'VIDEO' && el.tagName !== 'AUDIO')) return;
      if (G.mode === 'mute') { if (!el.muted) { el.muted = true; el.__kgMode = G.mode; } }
      else if (el.muted || Math.abs(el.volume - (G.mode === 'whisper' ? 0.02 : 1)) > 0.001) { applyMode(el); el.__kgMode = G.mode; }
    };
    document.addEventListener('play', clampSound, true);
    document.addEventListener('volumechange', clampSound, true);

    // 标签被 Chrome 挂起（内存节省/效率模式）时 JS 整个冻结，只能等它自己解冻后第一时间补播
    document.addEventListener('resume', () => {
      const v = document.querySelector('video');
      if (v && v.paused && resumable(v)) { say('  标签从挂起中恢复，补发起播手势'); fireGesture(); }
    });

    // 节流看门狗：这条是拿来区分「面板没逻辑」和「Chrome 把这个页面整个当后台了」的。
    // 1 秒一跳，如果某一跳隔了 3 秒以上才跑，说明定时器被节流；如果标签被冻结，
    // 解冻后会一次性报一个很大的迟到值。他截图里日志一条接手都没有，靠这个才能判清是哪一种。
    let tickAt = Date.now();
    setInterval(() => {
      const gap = Date.now() - tickAt;
      tickAt = Date.now();
      if (gap > 3000) {
        G.late = Math.max(G.late || 0, gap - 1000);
        say(`  定时器被节流：1 秒的跳实际隔了 ${Math.round(gap / 100) / 10} 秒（Chrome 把这页当后台了，切窗口请改用「微声保活」）`);
      }
    }, 1000);
  }

  // ---------- ⑤ 声音三态 + 2 倍速，换视频重新上默认值 ----------
  // 「静音」和「后台不被挂起」在 Chrome 里是冲突的：Chrome 只对**正在发声**的标签豁免
  // 定时器节流与内存节省挂起，而 muted 的视频不算发声。所以给三态：
  //   静音      —— 完全静音，切到后台可能被 Chrome 节流/挂起（这台机器上你看到的就是这个）
  //   微声保活  —— 不静音但音量 0.02（几乎听不见），标签会显示在发声，Chrome 就不动它
  //   开        —— 正常音量
  const RATE = 2;
  const MODES = [['mute', '静音'], ['whisper', '微声保活'], ['on', '开']];
  const modeLabel = () => ((MODES.filter((m) => m[0] === G.mode)[0] || MODES[0])[1]);
  function applyMode(v) {
    if (G.mode === 'mute') { v.muted = true; }
    else { v.muted = false; try { v.volume = G.mode === 'whisper' ? 0.02 : 1; } catch (e) { } }
  }
  const seen = new WeakSet();
  const keyOf = new WeakMap();
  const rateOwned = new WeakSet();
  function tuneMedia() {
    const vs = document.querySelectorAll('video');
    for (const v of vs) {
      const k = v.currentSrc || v.querySelector && v.querySelector('source') && v.querySelector('source').src || '';
      if (!seen.has(v) || (k && keyOf.get(v) !== k)) {
        seen.add(v); if (k) keyOf.set(v, k);
        applyMode(v); v.__kgMode = G.mode;
        rateOwned.add(v); try { v.playbackRate = RATE; } catch (e) { }
      } else {
        if (v.__kgMode !== G.mode) { applyMode(v); v.__kgMode = G.mode; }
        if (rateOwned.has(v)) { try { if (Math.abs(v.playbackRate - RATE) > 0.01) v.playbackRate = RATE; } catch (e) { } }
      }
    }
  }
  setInterval(tuneMedia, 1200);

  // ---------- 会话与接口 ----------
  const tok = () => localStorage.getItem('token2') || '';
  const who = () => { try { return JSON.parse(localStorage.getItem('userInfo2') || '{}'); } catch (e) { return {}; } };
  const post = (p, b) => rawFetch(p, { method: 'POST', headers: { Authorization: tok(), 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then((r) => r.json());
  const get = (p) => rawFetch(p, { headers: { Authorization: tok() } }).then((r) => r.json());
  const hhmmss = (s) => { s = Math.max(0, Math.round(s || 0)); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':'); };
  const toSec = (t) => String(t || '0:0:0').split(':').reduce((a, p) => a * 60 + (parseInt(p, 10) || 0), 0);

  async function courseDetails(c) {
    const u = who();
    const sid = c.studentCourseId || c.id;
    const d = await get(`/gateway/system/orgStudent/myCourseDetails?studentId=${encodeURIComponent(u.studyNumber || u.id)}&id=${c.id}&majorId=${u.majorId}&studentCourseId=${sid}&version=${c.version || 'BK_RJGC_2024'}`);
    const x = d.data || {};
    c._sid = sid; c._have = toSec(x.haveTime); c._sum = toSec(x.sumTime);
    return c;
  }

  async function scan() {
    const u = who();
    if (!tok()) { say('没有登录态，先登录'); return; }
    say(`账号 ${u.realName || u.name || '?'} / ${u.studyNumber || u.id || '?'}`);
    const cs = await post('/gateway/frequent/orgStudent/pagedMyCourse', {
      filters: { courseNature: null, name: '', schoolYear: '', studentId: String(u.id), term: '', courseFlag: 0 },
      pageIndex: 1, pageSize: 50,
    });
    const list = (cs.data && (cs.data.records || cs.data.list)) || [];
    for (const c of list) { try { await courseDetails(c); } catch (e) { c._have = 0; c._sum = 0; } }
    G.list = list;
    renderCourses();
    say(`${list.length} 门课，${list.filter((c) => c._sum - c._have > 2).length} 门有时长缺口`);
  }

  // ---------- 任务队列（跨页面跳转活下来，所以存 localStorage） ----------
  const loadJob = () => { try { return JSON.parse(localStorage.getItem(JOB_KEY) || 'null'); } catch (e) { return null; } };
  const saveJob = (j) => localStorage.setItem(JOB_KEY, JSON.stringify(j));
  const clearJob = () => localStorage.removeItem(JOB_KEY);
  // 勾选也要存：上一版每次渲染都按"有没有缺口"重画勾，用户自己勾的课会被冲掉
  const SEL_KEY = 'kg-sel';
  const loadSel = () => { try { return JSON.parse(localStorage.getItem(SEL_KEY) || 'null'); } catch (e) { return null; } };
  const saveSel = (ids) => localStorage.setItem(SEL_KEY, JSON.stringify(ids));

  function pickQueue() {
    const box = document.getElementById('kg-courses');
    const ids = [...box.querySelectorAll('input:checked')].map((i) => i.dataset.id);
    return G.list.filter((c) => ids.includes(c.id)).map((c) => ({ id: c.id, name: c.name, sid: c._sid, ver: c.version || 'BK_RJGC_2024' }));
  }

  async function startQueue() {
    const q = pickQueue();
    if (!q.length) { say('没勾选任何课程，先勾再点开始'); return; }
    const u = who();
    saveJob({ stu: u.studyNumber || u.id, queue: q, i: 0, done: {}, started: Date.now() });
    G.queue = q;
    say(`已排入 ${q.length} 门：${q.map((x) => x.name.slice(0, 8)).join('、')}（串行，一次只刷一门）`);
    await openNext();
  }

  // 取这门课里还没记满的视频，跳到第一条所在的学习页
  async function openNext() {
    const job = loadJob();
    if (!job) { say('没有待刷任务'); return; }
    if (job.i >= job.queue.length) {
      say(`✓ ${job.queue.length} 门课全部走完，任务清空`);
      clearJob(); renderCourses(); return;
    }
    const c = job.queue[job.i];
    G.cur = c;
    say(`→ 第 ${job.i + 1}/${job.queue.length} 门：${c.name}，枚举视频…`);
    renderCourses();
    const u = who();
    const pd = await get(`/gateway/system/orgStudent/progressDetails?studentId=${encodeURIComponent(job.stu)}&id=${c.id}&majorId=${u.majorId}&studentCourseId=${c.sid}&version=${c.ver}`);
    const vids = [];
    const walk = (n) => { for (const v of (n.courseCatalogVideoVos || [])) vids.push({ id: v.id, unitId: v.unitId || n.id, name: v.name, len: v.timeLength, have: toSec(v.haveTime) }); for (const k of (n.children || [])) walk(k); };
    (Array.isArray(pd.data) ? pd.data : []).forEach(walk);
    // 待播判据优先用**每条视频自己的 haveTime**：progressDetails 的视频节点其实带这个字段
    // （实测 2010-1 时长 339s、haveTime 00:05:39 = 记满），它不会像关卡接口那样漏掉顶层「课程介绍」。
    // 关卡接口只作为拿不到 haveTime 时的兜底 —— 拿不到就按"没看"处理，宁可多播不可漏播。
    const status = {};
    try {
      const bs = await get(`/gateway/system/orgStudent/listCourseBarrier?courseId=${c.id}&majorId=${u.majorId}&userId=${u.id}&version=${c.ver}&studentCourseId=${c.sid}`);
      for (const b of (bs.data || [])) {
        const ns = await get(`/gateway/system/orgStudent/listCatalogBarrier?barrierId=${b.id}&studentCourseId=${c.sid}`);
        for (const n of (ns.data || [])) if (n.videoId) status[n.videoId] = n.studyVideoStatus;
      }
    } catch (e) { say('  关卡状态取不到，全部按未看处理：' + e.name); }
    const filled = (v) => v.len && v.have >= v.len - 2;
    const hasHave = vids.some((v) => v.have > 0);
    const todo = hasHave ? vids.filter((v) => !filled(v)) : vids.filter((v) => status[v.id] !== 2);
    say(`  待播判据用${hasHave ? '每条视频自己的 haveTime' : '关卡接口状态（这门课没返回 per-video haveTime）'}`);
    job.curVids = vids.map((v) => v.id);
    job.todo = todo.map((v) => ({ id: v.id, unitId: v.unitId, name: v.name }));
    saveJob(job);
    const d = await courseDetails({ id: c.id, studentCourseId: c.sid, version: c.ver });
    job.baseHave = d._have; saveJob(job);
    say(`这门课 ${vids.length} 条视频，待播 ${todo.length} 条；服务端当前 ${hhmmss(d._have)}/${hhmmss(d._sum)}`);
    if (!todo.length) { say('  已记满，跳过'); job.i++; saveJob(job); return openNext(); }
    const target = vids.find((v) => v.id === todo[0].id);
    const url = `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=${c.id}&studentCourseId=${c.sid}&version=${c.ver}&courseUnitId=${target.unitId}&majorId=${who().majorId}&videoId=${target.id}`;
    say(`  打开「${target.name}」，页面刷新后面板自己起播（不用你点）`);
    // 整页跳转在任何页面都能到目标 URL，不再拿"加载时是不是学习页"当门槛（SPA 会让那个判断过期）
    G.lastNav = Date.now();
    location.href = url;
  }

  // ---------- 手动起播（面板自己也会定时调 fireGesture，见 UI 里的自动起播开关） ----------
  function playNow() {
    const hit = fireGesture();
    say(`起播手势打在「${hit}」上（播放键 .d-play-btn 被它盖着，打错元素就不进组件状态机），盯 60 秒看服务端涨不涨`);
    watchCredit(60);
  }

  // ---------- 片尾的「有习题待完成」弹窗：关掉继续播，绝不点「去练习」 ----------
  // 站点到片尾会弹这个框，而且**不自己顺播**，视频就停在片尾。runner 从没撞上，是因为它每条视频
  // 都整页导航走了；面板要自己走完队列，就得先把框关掉再跳下一条（点「去练习」会跳去做题）。
  function dismissDialog() {
    const box = [...document.querySelectorAll('.el-message-box, .el-dialog')]
      .find((b) => b.getBoundingClientRect().width > 0 && !(b.closest && b.closest('#kg-panel')));
    if (!box) return null;
    const title = (box.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 46);
    const x = box.querySelector('.el-message-box__headerbtn, .el-message-box__close, .el-dialog__headerbtn');
    if (x) { const r = x.getBoundingClientRect(); fireAll(x, r.left + r.width / 2, r.top + r.height / 2); }
    return title;
  }
  async function nextInCourse() {
    const job = loadJob();
    if (!job || !Array.isArray(job.todo)) return false;
    const cur = new URLSearchParams(location.search).get('videoId');
    const i = job.todo.findIndex((v) => v.id === cur);
    const nx = i >= 0 ? job.todo[i + 1] : job.todo.find((v) => v.id !== cur);
    if (!nx) { job.i++; saveJob(job); say('  这门课的队列走完了，进下一门'); await openNext(); return true; }
    const c = job.queue[job.i];
    const url = `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=${c.id}&studentCourseId=${c.sid}&version=${c.ver}&courseUnitId=${nx.unitId}&majorId=${who().majorId}&videoId=${nx.id}`;
    say(`  跳到下一条「${(nx.name || '').slice(0, 18)}」（不指望站点顺播，它到片尾会弹习题框卡住）`);
    setTimeout(() => { location.href = url; }, 600);
    return true;
  }

  // ---------- ⑦ 判据：直接比服务端 haveTime ----------
  // 这条判据救了我一次：v0.3.x 的「必须真人点一下」就是靠 haveTime 涨不涨推翻的，
  // 而推翻它之前我先信了"心跳次数"——心跳 22 次、账却 +0，差点又下错结论。
  // 两个坑要记住：①「课程介绍」这类视频发了心跳也不计进 haveTime（实测 +0），
  // ②haveTime 到顶的视频再播也不涨。所以对账要挑普通视频、挑有缺口的课。
  async function watchCredit(sec) {
    const job = loadJob();
    if (!job || !G.cur) { say('没有当前课程，无法对账'); return; }
    const t0 = Date.now();
    const v = document.querySelector('video');
    const base = job.baseHave || 0;
    let warned = false;
    while (Date.now() - t0 < sec * 1000) {
      await new Promise((r) => setTimeout(r, 5000));
      const d = await courseDetails({ id: G.cur.id, studentCourseId: G.cur.sid, version: G.cur.ver });
      const grew = d._have - base;
      say(`  +${Math.round((Date.now() - t0) / 1000)}s：进度 ${(v && v.currentTime || 0).toFixed(0)}s、心跳 ${G.beats} 次、服务端时长 ${grew >= 0 ? '+' : ''}${Math.round(grew)}s`);
      if (grew >= 3) { say('  ✓ 服务端在记账，面板自己起播这条路成立'); return; }
      if (!warned && v && !v.paused && (v.currentTime || 0) > 25) {
        warned = true;
        say('  ! 在播但时长没涨：要么这条是「课程介绍」类不计时长，要么这条已记满 —— 换一条普通视频再判，别急着说面板没用');
      }
    }
  }

  // ---------- UI ----------
  function renderCourses() {
    const box = document.getElementById('kg-courses');
    if (!box) return;
    box.innerHTML = '';
    const job = loadJob();
    const sel = loadSel();
    G.list.forEach((c) => {
      const gap = Math.max(0, (c._sum || 0) - (c._have || 0));
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;gap:6px;align-items:center;padding:2px 0;font-size:12px';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.dataset.id = c.id;
      // 首次（没存过选择）才按缺口自动勾；之后一律尊重用户自己的勾选，刷新不再冲掉
      cb.checked = sel ? sel.includes(c.id) : gap > 2;
      cb.onchange = () => saveSel([...box.querySelectorAll('input:checked')].map((i) => i.dataset.id));
      const nm = document.createElement('span'); nm.style.flex = '1';
      nm.textContent = (c.name || '').slice(0, 14);
      const st = document.createElement('span'); st.style.fontSize = '11px';
      if (job && job.curVids && job.queue[job.i] && job.queue[job.i].id === c.id) { st.style.color = '#1d4ed8'; st.textContent = '正在刷'; }
      else if (gap <= 2 && c._sum) { st.style.color = '#15803d'; st.textContent = '已记满'; }
      else { st.style.color = '#c2410c'; st.textContent = '缺 ' + hhmmss(gap); }
      const tt = document.createElement('span'); tt.style.color = '#94a3b8';
      tt.textContent = `${hhmmss(c._have)}/${hhmmss(c._sum)}`;
      row.append(cb, nm, st, tt);
      box.appendChild(row);
    });
  }

  function build() {
    if (!document.body || !dedupe() && document.getElementById('kg-panel')) return;
    if (document.getElementById('kg-panel')) return;
    const p = document.createElement('div');
    p.id = 'kg-panel';
    p.style.cssText = 'position:fixed;right:14px;bottom:14px;width:352px;max-height:74vh;overflow:auto;z-index:2147483000;background:#fff;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 6px 24px rgba(15,23,42,.16);font:13px/1.5 -apple-system,"Microsoft YaHei",sans-serif;color:#0f172a';
    p.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#1e3a8a;color:#fff;position:sticky;top:0">
        <b style="flex:1">海浪智学 · 任务面板 <span id="kg-ver" style="font-weight:400;font-size:11px;opacity:.8">v0.4.3</span></b>
        <button id="kg-sound" title="静音 / 微声保活 / 开 三态循环：要挂后台请选微声保活" style="cursor:pointer;font-size:11px">声音：静音</button>
        <button id="kg-min" style="cursor:pointer">—</button>
      </div>
      <div id="kg-body" style="padding:8px 10px">
        <div style="display:flex;gap:6px;margin-bottom:6px">
          <button id="kg-scan" style="flex:1;cursor:pointer">刷新课程与缺口</button>
          <button id="kg-play" style="flex:1;cursor:pointer">立即起播</button>
        </div>
        <label style="display:flex;align-items:center;gap:5px;font-size:11.5px;color:#334155;margin-bottom:4px"><input type="checkbox" id="kg-auto" checked>停着就自己起播（不用你点播放键）</label>
        <div style="font-size:11.5px;color:#64748b;line-height:1.45;margin-bottom:4px">分工：排队跳转、<b>起播</b>、2 倍速、声音、切窗口接手都由面板做。起播用的是打在"真正会被点到的元素"上的合成手势 —— 实测这样服务端照记：60 秒里 haveTime +90 秒（2 倍速看满 60 秒），上报接口全部 HTTP 200。</div>
        <div style="font-size:11.5px;color:#64748b;line-height:1.45;margin-bottom:4px">切窗口被停是站点播放器自己按的（失焦即 pause），面板在同一事件里同步接手。<b>要挂着后台跑，请把「声音」切到「微声保活」</b> —— Chrome 只给<b>正在发声</b>的标签豁免定时器节流和内存节省挂起，纯静音的视频会被它当后台处理，这时候页面里的脚本自己也会被冻住，谁都救不了。页脚三个数能分清责任：接手次数、暂停事件次数、定时器最大迟到。</div>
        <div id="kg-courses" style="margin:6px 0;border-top:1px dashed #e2e8f0;padding-top:6px"></div>
        <div style="display:flex;gap:6px">
          <button id="kg-run" style="flex:1;cursor:pointer;background:#16a34a;color:#fff;border:0;padding:7px;border-radius:6px">开始刷勾选的课程（排队）</button>
          <button id="kg-stop" style="cursor:pointer">停</button>
        </div>
        <pre id="kg-log" style="white-space:pre-wrap;font-size:11.5px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px;margin:8px 0 0;max-height:200px;overflow:auto"></pre>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px">心跳 <span id="kg-beat">0</span> · 监控 <span id="kg-mon">0</span> · 接手 <span id="kg-pause">0</span> · 暂停事件 <span id="kg-pseen">0</span> · 迟到 <span id="kg-late">0</span>ms · v0.4.3</div>
      </div>`;
    document.body.appendChild(p);
    const jb = p.querySelector('#kg-body');
    // 只要还在 /stu/ 下就显示：课程列表页上同样要看队列、也要能自己跳回视频页。
    // 之前按"是不是学习页"藏掉整个面板体，人在列表页就以为面板坏了。
    if (!/^\/stu\//.test(location.pathname)) { jb.style.display = 'none'; }
    p.querySelector('#kg-min').onclick = () => { jb.style.display = jb.style.display === 'none' ? '' : 'none'; };
    p.querySelector('#kg-sound').onclick = (e) => {
      const i = MODES.map((m) => m[0]).indexOf(G.mode);
      G.mode = MODES[(i + 1) % MODES.length][0];
      e.target.textContent = '声音：' + modeLabel();
      for (const v of document.querySelectorAll('video')) { applyMode(v); v.__kgMode = G.mode; }
      say(G.mode === 'whisper' ? '微声保活：音量 0.02，几乎听不见，但 Chrome 会把它当"正在发声的标签"，后台不节流、不挂起' : '声音：' + modeLabel() + '（倍速保持 2）');
    };
    p.querySelector('#kg-scan').onclick = () => { say('扫描中…'); scan(); };
    p.querySelector('#kg-play').onclick = playNow;
    p.querySelector('#kg-auto').onchange = (e) => {
      G.autoStart = e.target.checked;
      say(G.autoStart ? '已开自动起播：视频停着且不是你亲手停的，面板自己发起播手势' : '已关自动起播：只在你点「立即起播」或亲手点播放键时起播');
    };
    p.querySelector('#kg-run').onclick = async () => {
      const job = loadJob();
      // 有任务但这一页没视频 → 这一发就是"跳回去播"，不是回一句无关的「队列没变」
      if (job && !document.querySelector('video')) {
        G.lastNav = Date.now();
        say('  手动跳回待播条目（这一页没有视频）');
        await openNext();
        return;
      }
      if (G.waiting) { playNow(); return; }
      // 同一份勾选重复点「开始」不再重排一遍（实测连点三次会留三条一样的队列日志）
      const ids = pickQueue().map((x) => x.id).join(',');
      if (job && job.queue.map((x) => x.id).join(',') === ids) { say('队列没变，这门课正在播；要换课先点「停」'); return; }
      startQueue();
    };
    p.querySelector('#kg-stop').onclick = () => { clearJob(); G.running = false; say('已清空任务队列（不影响平台已记的账）'); renderCourses(); };
    setInterval(() => {
      const a = document.getElementById('kg-beat'), b = document.getElementById('kg-mon'), c = document.getElementById('kg-pause'),
        d = document.getElementById('kg-pseen'), e = document.getElementById('kg-late');
      if (a) a.textContent = G.beats;
      if (b) b.textContent = G.monitor;
      if (c) c.textContent = G.pauses || 0;
      if (d) d.textContent = G.pauseSeen || 0;
      if (e) e.textContent = Math.round(G.late || 0);
    }, 1000);
    // 每 60 秒悄悄把每门课的时长重取一遍：上一版只在点「刷新」时才更新，
    // 实测播了 19 分钟面板还停在旧数字，用户以为没在记账。
    setInterval(() => {
      if (!G.list.length) return;
      Promise.all(G.list.map((c) => courseDetails(c).catch(() => { }))).then(renderCourses);
    }, 60000);
    setInterval(renderCourses, 8000);
    // 有任务但视频停着 = 在等人点播放键。这种情况必须把按钮变成提示，
    // 否则用户点完「开始」看到画面没动，只会认为面板是假的。
    setInterval(async () => {
      const btn = document.getElementById('kg-run');
      if (!btn) return;
      const job = loadJob();
      const v = document.querySelector('video');
      const dlg = dismissDialog();
      if (dlg) say(`  有弹窗挡着，已点它的关闭按钮：「${dlg}」`);
      // 有任务、但这一页根本没有视频（人在课程列表页，或 SPA 把人带走了）→ 自己跳回待播那条。
      // 上一版漏了这条：按钮写着「正在刷」，实际什么都没播，用户点九下也没反应。
      if (job && !v) {
        if (Date.now() - (G.lastNav || 0) > 60000) {
          G.lastNav = Date.now();
          say('  这一页没有视频（不在学习页），跳回当前这门课的待播条目');
          await openNext();
        }
        btn.textContent = '▶ 不在视频页：正在跳回去播…';
        btn.style.background = '#d97706';
        return;
      }
      const atEnd = !!(job && v && v.duration && v.currentTime >= v.duration - 1.5);
      if (atEnd && !G.navigating) { G.navigating = 1; await nextInCourse(); return; }
      // 有任务、视频停着、而且不是他亲手停的 → 面板自己发起播手势（v0.4.1：实测这样服务端就记账）。
      // 8 秒冷却：一次没起来别每秒猛发，命中的是覆盖在播放器上的控件，连发不好收拾。
      const stuck = !!(job && v && v.paused && resumable(v));
      if (stuck && G.autoStart && Date.now() - (G.lastFire || 0) > 8000) {
        G.lastFire = Date.now();
        say(`  自动起播：手势打在「${fireGesture()}」上`);
      }
      G.waiting = stuck;
      const nowVid = new URLSearchParams(location.search).get('videoId');
      const idx = job && Array.isArray(job.todo) ? job.todo.findIndex((x) => x.id === nowVid) : -1;
      btn.textContent = !job ? '开始刷勾选的课程（排队）'
        : stuck ? '▶ 停着呢：点我起播（或你亲手点播放键）'
        : `正在播 ${(G.cur ? G.cur.name.slice(0, 10) : '')}${idx >= 0 ? ` 第 ${idx + 1}/${job.todo.length} 条` : ''}（改勾选先点「停」）`;
      btn.style.background = stuck ? '#d97706' : '#16a34a';
    }, 3000);
    const job = loadJob();
    if (job && job.i < job.queue.length) { G.cur = job.queue[job.i]; say(`有未完成任务：第 ${job.i + 1}/${job.queue.length} 门「${G.cur.name}」，面板会自己起播接着走`); }
    say('面板 v0.4.3 已加载（自动起播 + 同步接手 + 声音三态 + 节流看门狗）；页脚「暂停事件」有数而「接手」没涨 = 判据问题，两个都没涨 = 页面被 Chrome 冻住了');
    scan();
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(build, 300);
  else document.addEventListener('DOMContentLoaded', () => setTimeout(build, 300));
  new MutationObserver(() => { if (!document.getElementById('kg-panel')) { const n = document.querySelectorAll('div[id=kg-panel]').length; if (!n && !window.__kgBuilt) { window.__kgBuilt = 1; build(); } } else dedupe(); })
    .observe(document.documentElement, { childList: true, subtree: true });
})();
