// ==UserScript==
// @name         海浪智学 · 视频后台续播
// @namespace    local.hailang.autocourse
// @version      1.3.0
// @description  海浪智学学生端：切标签页/最小化后续播；每条视频都重新上默认值——静音 + 2 倍速（同一条视频内他亲手改过声音或倍速就不再干预）
// @author       hailang-user
// @match        https://study.cqie.edu.cn/stu/pages/MyCourse/Study*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

/*
 * 只匹配「课程学习页」这一条路由，刻意不匹配 /pages/MyExam/*（考试）和 /pages/Mistakes（错题），
 * 避免把可见性伪装带进任何计时答题的场景。
 */
(() => {
  'use strict';

  // 先把浏览器原生的取值方式存下来，兜底逻辑要靠它判断「是不是真的被切走了」
  const dHidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
  const dVis = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
  const reallyHidden = () => (dHidden && dHidden.get ? !!dHidden.get.call(document) : !!document.hidden);

  try {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  } catch (e) {
    console.warn('[后台续播] 可见性伪装失败', e);
  }

  // 兜底：万一还有别的路径把视频按停了。
  // pause 事件不冒泡，但捕获阶段能经过 document，所以在 document 上挂捕获监听即可覆盖所有 video。
  // 判据：只有「页面真的被切走」时出现的 pause 才不是用户点的，才自动续播；
  //      用户在前台亲手按暂停一律尊重，不抢回来。
  document.addEventListener(
    'pause',
    (e) => {
      const v = e.target;
      if (!v || v.tagName !== 'VIDEO' || !reallyHidden()) return;
      clearTimeout(v.__kgResume);
      v.__kgResume = setTimeout(() => {
        if (reallyHidden() && v.paused) v.play().catch(() => {});
      }, 400);
    },
    true
  );

  // 默认静音 + 默认 2 倍速。难点不是「设一次」，而是站点播放器**复用同一个 <video 元素>**：
  // 切到下一条视频时它只换 src 并把 muted 设回 false、倍速设回 1，所以「这个元素我处理过就不再碰」
  // 是错的（v1.2.0 就栽在这：第一条是静音的，第二条开始又有声音）。
  // 正确的边界是「视频标识变了没有」：换视频 = 重新上默认值；同一条视频内他亲手改过 = 本条不再干预。
  // 默认倍速。runner 会在注入前设 self.__kgRate 来改这个值（用来验「服务端是不是只认实时观看时长」），
  // 他自己浏览器里没人设，所以默认就是 2 倍。
  const RATE = Number(self.__kgRate || 2);
  const seen = new WeakSet(); // 这个元素见过没有（首次出现就上默认值，兼容用 <source> 子标签、src 恒空的情况）
  const vidKey = new WeakMap(); // 元素 -> 当前视频标识
  const selfMute = new WeakSet(); // 刚由脚本设的静音，忽略随之而来的那一次 volumechange
  const selfRate = new WeakSet(); // 同上，忽略那一次 ratechange
  const muteOwned = new WeakSet(); // 这一条视频他亲手开过声音
  const rateOwned = new WeakSet(); // 这一条视频他亲手改过倍速
  let lastUserInput = 0;
  ['pointerdown', 'keydown', 'wheel'].forEach((t) => document.addEventListener(t, () => (lastUserInput = Date.now()), true));

  const keyOf = (v) => v.currentSrc || v.src || '';
  const isMedia = (v) => v && (v.tagName === 'VIDEO' || v.tagName === 'AUDIO');
  const setMuted = (v) => {
    selfMute.add(v);
    v.muted = true;
    v.defaultMuted = true;
    v.volume = 1; // 用 muted 而不是把音量调小，这样他点开就是正常响度
  };
  const setRate = (v) => {
    if (v.playbackRate === RATE) return;
    selfRate.add(v);
    v.playbackRate = RATE;
  };
  const applyDefaults = (v) => {
    if (!isMedia(v)) return;
    const k = keyOf(v);
    const first = !seen.has(v);
    if (first) seen.add(v);
    if (!first && (!k || vidKey.get(v) === k)) return; // 还是同一条视频，不覆盖他的选择
    vidKey.set(v, k);
    muteOwned.delete(v);
    rateOwned.delete(v);
    setMuted(v);
    setRate(v);
  };
  const sweep = () => document.querySelectorAll('video, audio').forEach(applyDefaults);

  document.addEventListener(
    'volumechange',
    (e) => {
      const v = e.target;
      if (!isMedia(v)) return;
      if (selfMute.has(v)) {
        selfMute.delete(v);
        return;
      }
      if (v.muted) return; // 变成静音了，没什么要抢的
      if (Date.now() - lastUserInput < 1500) {
        muteOwned.add(v); // 1.5 秒内他动过手 = 是他要开声音，本条尊重
        return;
      }
      setMuted(v); // 播放器自己取消的静音，抢回来
    },
    true
  );

  document.addEventListener(
    'ratechange',
    (e) => {
      const v = e.target;
      if (!isMedia(v)) return;
      if (selfRate.has(v)) {
        selfRate.delete(v);
        return;
      }
      if (v.playbackRate !== RATE) {
        // ⚠️ 不能用「ratechange 不是我触发的就算用户改的」判：播放器初始化时会自己把 rate 设回 1，
        //    那样会把它的自动重置误判成用户意图、从此永久放权（第一版就栽在这，rate 恒为 1）。
        if (Date.now() - lastUserInput < 1500) rateOwned.add(v);
        else setRate(v);
      }
    },
    true
  );

  // 换视频的几个信号点都要重新上默认值；loadstart 是 src 变更最可靠的入口
  ['loadstart', 'durationchange', 'loadedmetadata', 'play', 'playing'].forEach((evt) =>
    document.addEventListener(evt, (e) => applyDefaults(e.target), true)
  );

  const applyIfOwnedFree = (v) => {
    if (!isMedia(v)) return;
    if (!muteOwned.has(v)) {
      if (!v.muted && Date.now() - lastUserInput >= 1500) setMuted(v);
    }
    if (!rateOwned.has(v)) setRate(v);
  };
  const sweep2 = () => document.querySelectorAll('video, audio').forEach(applyIfOwnedFree);

  sweep();
  try {
    const mo = new MutationObserver(() => {
      sweep();
      sweep2();
    });
    mo.observe(document.documentElement || document, { childList: true, subtree: true });
  } catch (e) {}
  // document-start 时 DOM 还没建好，补一段短轮询兜底（30 秒后停，避免长期占 CPU）
  let guard = 0;
  const timer = setInterval(() => {
    sweep();
    sweep2();
    if (++guard > 60) clearInterval(timer);
  }, 500);
})();
