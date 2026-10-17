// ==UserScript==
// @name         海浪智学 · 任务面板（原型）
// @namespace    local.hailang.autocourse
// @version      0.1.0
// @description  学生端右下角面板：看账号与每门课的缺口、勾选要刷的课程，并自检「面板点一下能不能拿到观看记账心跳」
// @author       hailang-user
// @match        https://study.cqie.edu.cn/stu/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

/*
 * 这一版只解决三件事，其余（刷课序列、答题、传产物）等这三件验过再加：
 *   ① 面板能不能在登录态里读到账号与课程（不需要 Node、不需要调试端口）
 *   ② 每门课的缺口用平台自己的原始量算（时长差），不读那个会谎报的 learned 百分比
 *   ③ 最关键也最不确定的一件：油猴脚本拿不到 CDP 的可信输入，
 *      那「用户点面板按钮 → 同一帧里点站点自己的播放控件」这条链，
 *      能不能让站点的播放器组件进入它自己的状态机、把 updateStudyVideoPlan 心跳发出来。
 *      心跳计数就是为这个问题装的，答案要么 0 要么 >0，不靠猜。
 */
(() => {
  'use strict';

  const G = { panel: null, beats: 0, plans: 0, monitor: 0, log: [] };

  // ---- 心跳探针：包住 fetch，只数次数、不碰内容 ----
  const HEARTBEAT = { updateStudyVideoPlan: 'plans', studyRecordVideoMonitor: 'monitor' };
  const rawFetch = window.fetch;
  window.fetch = async function (input, init) {
    try {
      const u = typeof input === 'string' ? input : (input && input.url) || '';
      const hit = Object.keys(HEARTBEAT).find((k) => u.includes(k));
      if (hit) G[HEARTBEAT[hit]]++;
      if (/updateStudyVideoPlan/.test(u)) G.beats++;
    } catch (e) { /* 探针不能影响请求本身 */ }
    return rawFetch.apply(this, arguments);
  };

  const tok = () => localStorage.getItem('token2') || '';
  const me = () => { try { return JSON.parse(localStorage.getItem('userInfo2') || '{}'); } catch (e) { return {}; } };
  const api = (path, body) => rawFetch(path, {
    method: 'POST',
    headers: { Authorization: tok(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  }).then((r) => r.json());
  const get = (path) => rawFetch(path, { headers: { Authorization: tok() } }).then((r) => r.json());
  const hhmmss = (s) => { s = Math.max(0, Math.round(s || 0)); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':'); };
  const toSec = (t) => String(t || '0:0:0').split(':').reduce((a, p) => a * 60 + (parseInt(p, 10) || 0), 0);
  const say = (m) => { G.log.push(m); if (G.log.length > 40) G.log.shift(); const el = document.getElementById('kg-log'); if (el) el.textContent = G.log.join('\n'); };

  async function loadCourses() {
    const u = me();
    if (!tok()) { say('没有登录态（localStorage.token2 为空），先登录'); return []; }
    say(`账号 ${u.realName || u.name || '?'} / ${u.studyNumber || u.id || '?'}`);
    const cs = await api('/gateway/frequent/orgStudent/pagedMyCourse', {
      filters: { courseNature: null, name: '', schoolYear: '', studentId: String(u.id), term: '', courseFlag: 0 },
      pageIndex: 1, pageSize: 50,
    });
    const list = (cs.data && (cs.data.records || cs.data.list)) || [];
    say(`课程 ${list.length} 门，逐门取时长…`);
    for (const c of list) {
      const sid = c.studentCourseId || c.id;
      try {
        const d = await get(`/gateway/system/orgStudent/myCourseDetails?studentId=${encodeURIComponent(u.studyNumber || u.id)}&id=${c.id}&majorId=${u.majorId}&studentCourseId=${sid}&version=${c.version || 'BK_RJGC_2024'}`);
        const x = d.data || {};
        c._have = toSec(x.haveTime); c._sum = toSec(x.sumTime);
      } catch (e) { c._have = 0; c._sum = 0; }
      c._sid = sid;
    }
    return list;
  }

  // ---- 自检：同一帧手势里把站点播放器推进它自己的状态机 ----
  // 只补发一个 click 是不够的：控件可能绑在 pointerdown/mouseup 上（实测只发 click 时视频根本不动）。
  // 所以按真实顺序补一整套；还不行就直接 play() —— 这一步是在用户点击的调用栈里发生的，
  // 带着用户激活（user activation），和脚本自己隔空调 play() 不是一回事。
  const fireAll = (el) => {
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const E = t.startsWith('pointer') ? PointerEvent : MouseEvent;
      try { el.dispatchEvent(new E(t, { bubbles: true, cancelable: true, view: window })); } catch (e) { /* 老内核没有 PointerEvent */ }
    }
  };
  function tryPlay() {
    const v = document.querySelector('video');
    if (!v) { say('这一页没有 <video>，先进到某个视频的学习页再点自检'); return; }
    const before = { plans: G.plans, monitor: G.monitor };
    const btn = document.querySelector('.d-play-btn, .dplayer-play-icon, [class*=play-btn], .control-play, .playBtn')
      || document.querySelector('.dplayer');
    say(`手势内补发整套指针事件到 ${btn ? btn.className || btn.tagName : 'video 本体'} 起播…`);
    fireAll(btn || v);
    setTimeout(() => {
      if (v.paused) {
        say('整套事件没让它起播，退回在用户激活里直接 play()…');
        v.play().catch((e) => say('play() 被拒：' + e.name));
      }
      setTimeout(() => {
        const dp = G.plans - before.plans, dm = G.monitor - before.monitor;
        say(`计数：心跳 updateStudyVideoPlan +${dp}、监控会话 +${dm}、paused=${v.paused}、进度 ${(v.currentTime || 0).toFixed(1)}s`);
        say(dp > 0 ? '✓ 这条路能记账 —— 面板可以独立刷课'
          : (v.paused ? '✗ 根本没起播：先解决起播再判记账'
            : '✗ 播了但零心跳：组件状态机没进去，得让用户自己点第一下'));
      }, 4000);
    }, 1200);
  }

  function render(list) {
    const box = document.getElementById('kg-courses');
    box.innerHTML = '';
    list.forEach((c, i) => {
      const gap = Math.max(0, c._sum - c._have);
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;gap:6px;align-items:center;padding:2px 0;font-size:12px';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.dataset.i = i; cb.checked = gap > 2;
      // 课程名走 textContent，不当标记解析：名字里真出现 < > 时不该变成可执行片段
      const nm = document.createElement('span'); nm.style.flex = '1'; nm.textContent = (c.name || '').slice(0, 14);
      const gp = document.createElement('span'); gp.style.color = gap > 2 ? '#c2410c' : '#15803d';
      gp.textContent = gap > 2 ? '缺 ' + hhmmss(gap) : '已记满';
      const tt = document.createElement('span'); tt.style.color = '#94a3b8';
      tt.textContent = `${hhmmss(c._have)}/${hhmmss(c._sum)}`;
      row.append(cb, nm, gp, tt);
      box.appendChild(row);
    });
    say(`勾选了 ${box.querySelectorAll('input:checked').length} 门有缺口的课`);
  }

  function build() {
    if (G.panel) return;
    const p = document.createElement('div');
    p.id = 'kg-panel';
    p.style.cssText = 'position:fixed;right:16px;bottom:16px;width:340px;max-height:70vh;overflow:auto;z-index:2147483000;background:#fff;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 6px 24px rgba(15,23,42,.16);font:13px/1.5 -apple-system,"Microsoft YaHei",sans-serif;color:#0f172a';
    p.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#1e3a8a;color:#fff;position:sticky;top:0">
        <b style="flex:1">海浪智学 · 任务面板</b>
        <button id="kg-min" style="cursor:pointer">—</button>
      </div>
      <div id="kg-body" style="padding:8px 10px">
        <div style="display:flex;gap:6px;margin-bottom:6px">
          <button id="kg-scan" style="flex:1;cursor:pointer">① 刷新课程与缺口</button>
          <button id="kg-selftest" style="flex:1;cursor:pointer">② 记账自检</button>
        </div>
        <div style="font-size:12px;color:#64748b">「记账自检」要在某个视频的学习页上点，它验的是「面板点一下能不能拿到观看心跳」。</div>
        <div id="kg-courses" style="margin:6px 0;border-top:1px dashed #e2e8f0;padding-top:6px"></div>
        <div style="display:flex;gap:6px">
          <button id="kg-run" style="flex:1;cursor:pointer;background:#16a34a;color:#fff;border:0;padding:6px;border-radius:6px">开始刷勾选的课程</button>
        </div>
        <pre id="kg-log" style="white-space:pre-wrap;font-size:11.5px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px;margin:8px 0 0;max-height:180px;overflow:auto"></pre>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px">心跳累计 <span id="kg-beat">0</span> · 监控会话 <span id="kg-mon">0</span></div>
      </div>`;
    document.body.appendChild(p);
    G.panel = p;
    p.querySelector('#kg-min').onclick = () => { const b = p.querySelector('#kg-body'); b.style.display = b.style.display === 'none' ? '' : 'none'; };
    p.querySelector('#kg-scan').onclick = async () => { say('扫描中…'); G._list = await loadCourses(); render(G._list); };
    p.querySelector('#kg-selftest').onclick = tryPlay;
    p.querySelector('#kg-run').onclick = () => say('序列播放/答题还没接：先点「记账自检」把最不确定的一环验掉');
    setInterval(() => {
      const a = document.getElementById('kg-beat'), b = document.getElementById('kg-mon');
      if (a) a.textContent = G.plans;
      if (b) b.textContent = G.monitor;
    }, 1000);
  }

  build();
  // 给自检留的读数口：面板内部状态在闭包里，外面（包括我以后用 CDP 验）只能从这里拿
  window.__kgPanel = G;
})();
