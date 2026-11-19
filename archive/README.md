# 探针与取证归档索引

`.cdp/` 下的历史探针**保持原位**，本文件只做索引。不移动它们的理由：这些脚本的价值是当时的失败过程与原始输出，不是可复用工具；移动会打断相对路径和文中的“见 `.cdp/xxx`”引用。

- 全量清单：`git ls-files .cdp`
- 运行约定：在仓库根目录执行；多数脚本连 `CDP_BASE`（默认 `http://127.0.0.1:9224`，面板相关多用 `9225`），需要已登录的 Chrome
- 命名约定：`panel-*` 面板状态机；`probe-*` 接口字段形状；`kn-*` 知识练习；`codeq-*` 编程题；`test-*` 回归或验证；`.js` 多为页面内 `Runtime.evaluate` 片段；`.ps1` 启动与进程管理
- 隐私：部分历史探针硬编码课程/单元对象 ID（不是学号，但能反查到具体课程）。不要用其他账号直接跑这些探针

---

## 1. 仍作为工具维护（21 个，留在 `.cdp/`）

| 文件 | 用途 |
| --- | --- |
| `cdp.mjs` | 最小 CDP 客户端（WebSocket + 自增 id + pending 表） |
| `inventory.mjs` / `records.mjs` | 只读盘点 / 当前学期对账表 |
| `queue.mjs` / `supervise.mjs` | 多门课串跑队列与守护 |
| `inject-keeper.mjs` | 无 Tampermonkey 时的常驻注入器 |
| `test-prefs-persist.mjs` | 面板开关记忆 E2E（11 断言，动态端口、杀整棵 Chrome 进程树） |
| `mute-unit-test.html` / `run-mute-test.mjs` | 静音/倍速归属夹具与运行器（8 断言） |
| `launch-visible.ps1` / `launch-headless.ps1` / `launch-headless-url.ps1` | 起 Chrome |
| `start-keeper.ps1` / `start-queue.ps1` / `stop-jobs.ps1` / `jobs.ps1` | 常驻注入、队列、停车 |
| `chrome-args.ps1` / `kill-chrome.ps1` / `kill.ps1` / `proc-name.ps1` / `close-instance.mjs` | 进程与启动参数辅助 |

## 2. 起播、心跳与记账（结论见 README 第二节）

- 核心取证：`trusted-vs-synthetic.mjs`（四种起播方式逐相位重载）、`hb-resp.mjs`（抓心跳请求体/响应体）、`per-video-have.mjs`（证明 `+0` 是样本记满）、`real-human.mjs`、`human-path.mjs`、`synthetic-start.mjs`
- 后台/挂起：`bgrun.mjs`、`bgtest.mjs`、`bgtest2.mjs`、`hb.mjs`、`capture-monitor.mjs`、`capture-plan.mjs`、`capture-plan2.mjs`、`capture-unload.mjs`、`passive-capture.mjs`、`evtrace.mjs`、`listeners.mjs`、`raf-check.mjs`、`media-diag.mjs`、`ua-test.mjs`、`test-noforeground.mjs`
- 输入与点击：`click-vs-navigate.mjs`、`clicktrace.mjs`、`fix-click.mjs`、`tap.mjs`、`full-capture.mjs`、`input-probe.mjs`、`keyboard-play-test.mjs`、`keyevent-test.mjs`、`player-ui-test.mjs`
- 倍速/记账对照：`rate.js`、`watch-rate.mjs`、`verify-rate.mjs`、`verify-mute.mjs`、`verify_start.mjs`、`cold-1x-test.mjs`、`test-1x-credit.mjs`、`one-x-close.mjs`、`end-test.mjs`
- 片尾与页面修复：`test-tail-seek.mjs`、`test-refresh-heal.mjs`、`test-listpage-heal.mjs`、`segment-control.mjs`、`segment-state.mjs`、`segment-reentry-test.mjs`、`topup-segments.mjs`
- 其他：`why-nocredit.mjs`

## 3. 面板状态机与可见性

`panel-resume.mjs`（A/B/C/D 受控对照：原生 visible 下 programmatic pause、v0.3.3 毫秒级接手、可信点击尊重用户意图、最小化 20 秒）、`panel-resume2.mjs`（窗口在屏幕外 → native hidden → CDP 输入不送达）、`panel-why.mjs`（注入异常原样打印）、`panel-autostart.mjs`、`panel-autoadvance.mjs`、`panel-autoadvance2.mjs`、`panel-answer-test.mjs`、`panel-credit.mjs`、`panel-dialog.mjs`、`panel-inject-loop.mjs`、`panel-instr.mjs`、`panel-selftest.mjs`、`try-text.mjs`、`diag.js`、`vis.js`、`vis2.js`、`vis-check.mjs`、`minimize.mjs`、`set-window.mjs`、`tabs-state.mjs`、`session-state.mjs`

## 4. 课程结构与进度

`all-courses.mjs`、`course-times.mjs`、`course.js`、`coursestate.js`、`barrier.js`、`barrier-videos.mjs`、`intro.js`、`intro-enumerate.mjs`、`intro-unit.mjs`、`where-is-intro.mjs`、`list-videos.mjs`、`tree.js`、`tree2.js`、`tree-status.mjs`、`jtree.js`、`node1.js`、`node2.js`、`expand-probe.mjs`、`inspect-progress.mjs`、`progress-trace.mjs`、`prog.js`、`corr.js`、`status-table.mjs`、`diff-status.mjs`、`diff-two.mjs`、`miss.js`、`lvl.js`、`enum.js`、`findcourse.js`、`open-video.mjs`、`nav.mjs`、`peek.mjs`、`peek-page.mjs`、`gcz.js`、`chunk-crawl.mjs`、`java-units.mjs`、`video-status-field.mjs`、`vidcheck.js`、`vd.js`、`vd2.js`、`start-route.mjs`

## 5. 章节习题链路

`ex.js`、`ex2.js`、`ex3.js`、`exflow.js`、`exstatus.js`、`qtypes.js`、`question-types.mjs`、`sample-types.mjs`、`sample.mjs`、`map-exercise.mjs`、`find-exercise.mjs`、`find-trigger.mjs`、`findr.js`、`findr2.js`、`findr3.js`、`findr4.js`、`do-one-exercise.mjs`、`autofill-exercises.mjs`、`answer-unit.mjs`、`check-one.mjs`、`verify-exercise.mjs`、`verify.js`、`close-record-test.mjs`、`scan-exercises.mjs`、`judge.js`、`rec.js`、`rows.mjs`、`row-anatomy.mjs`、`tree-exercise-keys.mjs`、`ui-exercise-trace.mjs`、`test-answer-feedback.mjs`、`test-verifiable.mjs`、`audit.js`、`api-paths.mjs`、`apifind.js`、`routes.js`、`scan-endpoints.mjs`、`record-gateway.mjs`、`nettrace.mjs`、`qd.js`、`qd2.js`、`sp.js`、`sp2.js`、`sp3.js`、`sp4.js`、`sp5.js`、`sp6.js`

## 6. 知识练习链路

`ke.js`、`kn.js`、`kncall.js`、`knlast.js`、`knrun.js`、`knrun2.js`、`knvid.js`、`kn-917.mjs`、`kn-917-fix.mjs`、`kn-field.mjs`、`kn-get.mjs`、`kn-inventory.mjs`、`kn-inventory2.mjs`、`kn-matrix.mjs`、`kn-outer.mjs`、`kn-probe.mjs`、`kn-raw.mjs`、`kn-replay.mjs`、`kn-source.mjs`、`knowledge-layer.mjs`、`trace-knowledge.mjs`

## 7. 编程题与设计题

`code1.js`、`codewin.js`、`codeq-audit.mjs`、`codeq-diff.mjs`、`codeq-endpoints.mjs`、`codeq-fix.mjs`、`codeq-record.mjs`、`codeq-urls.mjs`、`codeq-verify.mjs`、`extract-codeq.mjs`、`inspect-codeq.mjs`、`find-upload-route.mjs`、`probe-upload-shape.mjs`、`selfcheck-codeq.mjs`、`selfcheck-zip.mjs`、`run-codeq.mjs`、`design-list.mjs`、`design-stem.mjs`、`type8-shape.mjs`、`subjective-scan.mjs`、`vue3-stem.mjs`、`draw-panel-pause.py`、`up.js`、`upwin.js`、`upwin2.js`

## 8. 接口字段形状与通用快照

`probe.js`、`probe2.js`～`probe12.js`、`probe-array.mjs`、`probe-dto.mjs`、`probe-htmlrun.mjs`、`probe-htmlrun2.mjs`、`probe-intro-page.mjs`、`probe-keys.mjs`、`probe-node.mjs`、`probe-raw.mjs`、`probe-row.mjs`、`probe-status-shape.mjs`、`probe-submit-dto.mjs`、`probe-submit-types.mjs`、`probe-submitcode.mjs`、`probe-submitcode2.mjs`、`probe-vue-dto.mjs`、`probe-vue-shape.mjs`

## 9. 一次性 DOM / Vue 片段

`adv.js`、`ap.js`、`el.js`、`el2.js`、`elwin.js`、`elwin2.js`、`flagwin.js`、`flagwin2.js`、`item.js`、`lb.js`、`look.js`、`look2.js`、`mcd.js`、`mcd2.js`、`mem.js`、`patch1.js`、`pending.js`、`pinia.js`、`res.js`、`res2.js`、`res3.js`、`rev.js`、`reg.js`、`mk2.js`、`scan-page.js`、`user.js`、`vnode.js`、`win.js`、`login-check.mjs`、`rawl.mjs`

---

## 结论入口

- 平台机制（鉴权、起播、`haveTime`、播放器复用、片尾、可见性）：主 README 第二节
- 答题链路（`operationId`、`clearStudentUnit`、回读前 `exerciseBarrier`）：主 README 第三节
- 常见误判与对应证据：主 README 第五节
- 已删除的本地未跟踪产物（`privacy-expressions.txt`、`publish2/`、pre-rewrite bundle）没有入库，也不需要在这里留副本
