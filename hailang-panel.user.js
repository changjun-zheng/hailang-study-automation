// ==UserScript==
// @name         海浪智学 · 任务面板
// @namespace    local.hailang.autocourse
// @version      0.3.0
// @description  学生端任务面板：看账号与每门课缺口、勾选课程排队刷、默认静音+2倍速、切标签不中断，并把「服务端到底记没记账」直接显示出来
// @author       hailang-user
// @match        https://study.cqie.edu.cn/stu/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

/*
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
 * 播放内核与 hailang-background-play.user.js 同源（那套逻辑是 CDP 通道实测出来的），
 * 差别在于这里没有可信输入：起播必须挂在「用户点面板按钮」这一次真实手势的调用栈里。
 * 所以面板不承诺"全自动"，它承诺"你点一下开始，剩下它自己走"。
 */
(() => {
  'use strict';

  const STUDY = /\/stu\/pages\/MyCourse\/Study/.test(location.pathname);
  const JOB_KEY = 'kg-job';

  // ---------- ② 单例 ----------
  if (window.__kgPanel) { console.log('[任务面板] 已有实例，本次不重复注入'); return; }
  window.__kgPanel = { version: '0.3.0' };
  const dedupe = () => {
    const all = document.querySelectorAll('#kg-panel');
    for (let i = 1; i < all.length; i++) all[i].remove();
    return all.length > 0;
  };

  const G = {
    list: [], queue: [], cur: null, beats: 0, monitor: 0, sound: false,
    running: false, baseHave: 0, log: [],
  };
  window.__kgPanel.G = G;   // 给自检脚本读数用（面板自己不依赖它）

  const say = (m) => {
    G.log.push(`[${new Date().toTimeString().slice(0, 8)}] ${m}`);
    if (G.log.length > 60) G.log.shift();
    const el = document.getElementById('kg-log');
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

  // ---------- ⑥ 伪装可见性 + 只补真被切走时的暂停 ----------
  if (STUDY) {
    const dH = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
    const dV = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
    const reallyHidden = () => (dH && dH.get ? !!dH.get.call(document) : !!document.hidden);
    try {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    } catch (e) { console.warn('[任务面板] 可见性伪装失败', e); }
    document.addEventListener('pause', (e) => {
      const v = e.target;
      if (!v || v.tagName !== 'VIDEO' || !reallyHidden()) return;   // 用户亲手暂停一律尊重
      clearTimeout(v.__kgResume);
      v.__kgResume = setTimeout(() => { if (reallyHidden() && v.paused) v.play().catch(() => { }); }, 400);
    }, true);
  }

  // ---------- ⑤ 默认静音 + 2 倍速，换视频重新上默认值 ----------
  const RATE = 2;
  const seen = new WeakSet();
  const keyOf = new WeakMap();
  const ownedMute = new WeakSet();
  const rateOwned = new WeakSet();
  function tuneMedia() {
    const vs = document.querySelectorAll('video');
    for (const v of vs) {
      const k = v.currentSrc || v.querySelector && v.querySelector('source') && v.querySelector('source').src || '';
      if (!seen.has(v) || (k && keyOf.get(v) !== k)) {
        seen.add(v); if (k) keyOf.set(v, k);
        if (!G.sound) { ownedMute.add(v); v.muted = true; }
        rateOwned.add(v); try { v.playbackRate = RATE; } catch (e) { }
      } else {
        if (rateOwned.has(v)) { try { if (Math.abs(v.playbackRate - RATE) > 0.01) v.playbackRate = RATE; } catch (e) { } }
        if (G.sound && ownedMute.has(v)) { ownedMute.delete(v); v.muted = false; }
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
    const walk = (n) => { for (const v of (n.courseCatalogVideoVos || [])) vids.push({ id: v.id, unitId: v.unitId || n.id, name: v.name, len: v.timeLength }); for (const k of (n.children || [])) walk(k); };
    (Array.isArray(pd.data) ? pd.data : []).forEach(walk);
    // 完成状态只能从关卡接口拿：progressDetails 的视频节点不带 studyVideoStatus，
    // 它的 haveTime 恒为 0，拿它判会得出「41 条全没看」这种错账。
    // 关卡接口又会漏掉没有子节点的顶层关卡（如「课程介绍」），所以拿不到状态的按"没看"处理，宁可多播不可漏播。
    const status = {};
    try {
      const bs = await get(`/gateway/system/orgStudent/listCourseBarrier?courseId=${c.id}&majorId=${u.majorId}&userId=${u.id}&version=${c.ver}&studentCourseId=${c.sid}`);
      for (const b of (bs.data || [])) {
        const ns = await get(`/gateway/system/orgStudent/listCatalogBarrier?barrierId=${b.id}&studentCourseId=${c.sid}`);
        for (const n of (ns.data || [])) if (n.videoId) status[n.videoId] = n.studyVideoStatus;
      }
    } catch (e) { say('  关卡状态取不到，全部按未看处理：' + e.name); }
    const todo = vids.filter((v) => status[v.id] !== 2);
    job.curVids = vids.map((v) => v.id);
    job.todo = todo.map((v) => v.id);
    saveJob(job);
    const d = await courseDetails({ id: c.id, studentCourseId: c.sid, version: c.ver });
    job.baseHave = d._have; saveJob(job);
    say(`这门课 ${vids.length} 条视频，待播 ${todo.length} 条；服务端当前 ${hhmmss(d._have)}/${hhmmss(d._sum)}`);
    if (!todo.length) { say('  已记满，跳过'); job.i++; saveJob(job); return openNext(); }
    const target = vids.find((v) => v.id === todo[0]);
    const url = `https://study.cqie.edu.cn/stu/pages/MyCourse/Study?id=${c.id}&studentCourseId=${c.sid}&version=${c.ver}&courseUnitId=${target.unitId}&majorId=${who().majorId}&videoId=${target.id}`;
    say(`  打开「${target.name}」，页面刷新后点面板的「继续起播」`);
    if (STUDY) location.href = url; else { G.pendingUrl = url; say('  （这条要在学习页上跑，请手动进任一视频页）'); }
  }

  // ---------- 同帧手势起播 ----------
  const fireAll = (el) => {
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const E = t.startsWith('pointer') ? PointerEvent : MouseEvent;
      try { el.dispatchEvent(new E(t, { bubbles: true, cancelable: true, view: window })); } catch (e) { }
    }
  };
  function playNow() {
    const v = document.querySelector('video');
    if (!v) { say('这一页没有视频，先进到某个视频的学习页'); return; }
    const btn = document.querySelector('.d-play-btn, [class*=play-btn]') || v;
    fireAll(btn);
    setTimeout(() => { if (v.paused) v.play().catch((e) => say('play() 被拒：' + e.name)); }, 1200);
    say(`已用本次手势推进播放器（${btn.className || btn.tagName}），盯 20 秒看服务端涨不涨`);
    watchCredit(20);
  }

  // ---------- ⑦ 判据：直接比服务端 haveTime ----------
  // 实测结论（2026-10-17，账号 CLASSMATE_ACCOUNT）：面板自己推进播放器时，180 秒视频播完、
  // 服务端 haveTime 涨 0 秒、心跳 0 次 —— 站点的播放器组件只认真人按在它控件上的手势，
  // 脚本代点（哪怕在同一次用户手势的调用栈里）不进它的状态机。
  // 所以面板不假装能全自动刷播放：它负责排队跳转、倍速、静音、切标签不中断、答题，
  // 起播那一下要请用户亲手点，看门狗负责在"播了但没记账"时立刻说清楚。
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
      if (grew >= 3) { say('  ✓ 服务端在记账，这条路成立'); return; }
      if (!warned && v && !v.paused && (v.currentTime || 0) > 25) {
        warned = true;
        say('  ! 视频在播但服务端没记账 —— 请你自己点一下视频上的播放键（面板会接手倍速、静音、切标签与跳转）');
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
        <b style="flex:1">海浪智学 · 任务面板</b>
        <button id="kg-sound" title="默认静音；点一下开声音" style="cursor:pointer;font-size:11px">声音：关</button>
        <button id="kg-min" style="cursor:pointer">—</button>
      </div>
      <div id="kg-body" style="padding:8px 10px">
        <div style="display:flex;gap:6px;margin-bottom:6px">
          <button id="kg-scan" style="flex:1;cursor:pointer">刷新课程与缺口</button>
          <button id="kg-play" style="flex:1;cursor:pointer">继续起播</button>
        </div>
        <div style="font-size:11.5px;color:#64748b;line-height:1.45;margin-bottom:4px">分工：排队跳转、2 倍速、静音、切标签不中断都由面板做；<b>起播那一下要你亲手点播放键</b> —— 实测脚本代点时心跳一次都不发（真人点一次累计到 81 次），站点的播放器只认真人手势。点过一次之后顺播与记账会自己续上。</div>
        <div id="kg-courses" style="margin:6px 0;border-top:1px dashed #e2e8f0;padding-top:6px"></div>
        <div style="display:flex;gap:6px">
          <button id="kg-run" style="flex:1;cursor:pointer;background:#16a34a;color:#fff;border:0;padding:7px;border-radius:6px">开始刷勾选的课程（排队）</button>
          <button id="kg-stop" style="cursor:pointer">停</button>
        </div>
        <pre id="kg-log" style="white-space:pre-wrap;font-size:11.5px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px;margin:8px 0 0;max-height:200px;overflow:auto"></pre>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px">心跳累计 <span id="kg-beat">0</span> · 监控会话 <span id="kg-mon">0</span> · 面板 v0.3.0</div>
      </div>`;
    document.body.appendChild(p);
    const jb = p.querySelector('#kg-body');
    if (!STUDY) { jb.style.display = 'none'; }
    p.querySelector('#kg-min').onclick = () => { jb.style.display = jb.style.display === 'none' ? '' : 'none'; };
    p.querySelector('#kg-sound').onclick = (e) => {
      G.sound = !G.sound; e.target.textContent = '声音：' + (G.sound ? '开' : '关');
      for (const v of document.querySelectorAll('video')) { v.muted = !G.sound; if (G.sound) ownedMute.delete(v); }
      say(G.sound ? '已开声音（倍速保持 2）' : '已静音');
    };
    p.querySelector('#kg-scan').onclick = () => { say('扫描中…'); scan(); };
    p.querySelector('#kg-play').onclick = playNow;
    p.querySelector('#kg-run').onclick = () => {
      // 同一份勾选重复点「开始」不再重排一遍（实测连点三次会留三条一样的队列日志）
      const ids = pickQueue().map((x) => x.id).join(',');
      const job = loadJob();
      if (job && job.queue.map((x) => x.id).join(',') === ids) { say('队列没变，继续跑当前这门；要换课先点「停」'); return; }
      startQueue();
    };
    p.querySelector('#kg-stop').onclick = () => { clearJob(); G.running = false; say('已清空任务队列（不影响平台已记的账）'); renderCourses(); };
    setInterval(() => {
      const a = document.getElementById('kg-beat'), b = document.getElementById('kg-mon');
      if (a) a.textContent = G.beats;
      if (b) b.textContent = G.monitor;
    }, 1000);
    // 每 60 秒悄悄把每门课的时长重取一遍：上一版只在点「刷新」时才更新，
    // 实测播了 19 分钟面板还停在旧数字，用户以为没在记账。
    setInterval(() => {
      if (!G.list.length) return;
      Promise.all(G.list.map((c) => courseDetails(c).catch(() => { }))).then(renderCourses);
    }, 60000);
    setInterval(renderCourses, 8000);
    const job = loadJob();
    if (job && job.i < job.queue.length) { G.cur = job.queue[job.i]; say(`有未完成任务：第 ${job.i + 1}/${job.queue.length} 门「${G.cur.name}」，点「继续起播」接着走`); }
    scan();
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(build, 300);
  else document.addEventListener('DOMContentLoaded', () => setTimeout(build, 300));
  new MutationObserver(() => { if (!document.getElementById('kg-panel')) { const n = document.querySelectorAll('div[id=kg-panel]').length; if (!n && !window.__kgBuilt) { window.__kgBuilt = 1; build(); } } else dedupe(); })
    .observe(document.documentElement, { childList: true, subtree: true });
})();
