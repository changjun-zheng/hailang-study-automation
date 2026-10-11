# hailang-AutoCourse

重庆工程学院「海浪智学」学生端（`study.cqie.edu.cn/stu/home`）的课程视频后台自动播放工具，附带对该平台**进度记账机制**的实测记录。

零第三方依赖：只用 Node ≥ 24 内置的 `fetch` / `WebSocket` 直连 Chrome DevTools 协议，不用 Puppeteer / Playwright / Selenium。

---

## 一、怎么用

前提：本机装了 Chrome，且有一个能用的登录态。工具会**自己拉起**一个 headless Chrome（专用 profile，不与日常浏览器共用）。

```bash
node runner.mjs --course 软件系统分析与设计      # 单门课，跑到全部播完
node verify.mjs --course 软件系统分析与设计      # 只读核验：打印平台自己认的账
node .cdp/records.mjs                            # 五门课的完整账目对照
```

多门课串跑（当前在用的形态）：

```bash
node .cdp/supervise.mjs --course 前端框架开发技术 >> vue-play.log   # 守护：断了自动重起
node .cdp/queue.mjs >> queue.log                                    # 队列：上一门收尾后接下一门
powershell -File .cdp/stop-jobs.ps1                                 # 停车（连队列一起停）
```

重启顺序必须是**先 supervise 再 queue**，否则 queue 会在没人跑的状态下直接推进到下一门。

油猴脚本（自己的日常浏览器里用，不依赖本仓库其它部分）：`hailang-background-play.user.js`
作用是被切到后台时继续播放 + 每条视频默认静音 + 默认 2 倍速；实测 2 倍速是真实有效的 2.00 倍，不是"界面显示 2x、实际被降帧"。

环境变量：

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| `HAILANG_HEADLESS=0` | headless | 改成有窗口模式（调试用） |
| `HAILANG_RATE=1` | 2 | 注入前覆盖默认倍速 |
| `ALLOW_FOREGROUND=1` | 不抢屏幕 | 允许在媒体加载不出来时把窗口提到前台 |
| `CDP_BASE` | `http://127.0.0.1:9224` | DevTools 端口 |

---

## 二、平台机制实测（这个仓库真正的价值在这部分）

### 1. 鉴权不在 Cookie

登录态是 `localStorage.token2` 里的一枚 JWT，**没有 `exp`**，所以关掉浏览器重开还在。所有请求靠 `Authorization: <token2>` 头，Cookie 参与不了。

一个账号**只允许一个活跃会话**。别处登录会把这边顶掉，返回体是 `code:488 / "当前账号于 HH:MM 在其他设备上登录,此客户端已退出登录。"`；被顶掉之后读接口仍然回 200 但没有数据，很容易误判成"课没了"，所以 `runner.mjs` 里有一个 `guard()` 专门识别它并以退出码 4 终止，不做无谓重试。

### 2. 进度是怎么记账的 —— 反直觉的那条

**播放过程中不上报任何进度。** 全程只有两个请求：

- 进入视频页：`GET /gateway/system/orgStudent/studyVideo`（开启一条监控记录）
- 离开视频页：`GET /gateway/study/studyRecordVideoMonitor/updateEndTime`（关闭）

也就是说服务端只拿到"开始时刻"和"结束时刻"两个戳，中间没有心跳、没有 `currentTime` 上报。这条结论是**排除了 8 个客户端变量**之后剩下的唯一解释：是否前台、是否真实可见、倍速 1x/2x、是否点目录切换 vs 直接导航、是否手动关闭上一条监控、冷启动 vs 续播、时长是否播满、`haveTime` 字段各种写法——每一个都做了对照实验，都不影响记账。

反过来，**跨课数据证明记账本身是通的**：软件系统分析与设计 6:17:31/6:21:13、软件工程 7:05:45/7:05:56、软件测试 5:55:17/5:58:40、框架程序设计 10:50:42/10:52:54 都记上了；只有前端框架开发技术长期停在 01:33:03/08:20:21。

按使用方的口径，**没记上的原因是"每条视频挂的练习题没做，做了才算完成"**——即视频长度只是必要条件之一，不是充分条件。这解释了上面那组"四门记上、一门没记上"的差异。

### 3. 播放器：DPlayer，且它会**复用同一个 `<video>` 元素**

切下一条视频不换 DOM 节点，只换 `src`，并且**把 `muted` 和 `playbackRate` 重置回默认**。这就是"第一条静音了，下一条又有声音"的根因——任何"每个元素只处理一次"的写法（`WeakSet` 标记一次就不再管）在这个播放器上必然漏。

正确做法是**以"视频身份"为键而不是以"元素"为键**：

```js
const keyOf = (v) => v.currentSrc || v.src || '';
// src 变了 ⇒ 判定为新的一条视频 ⇒ 重新施加默认静音 / 默认倍速
// src 没变 ⇒ 是同一条，绝不覆盖用户在这一条里的手动选择
```

同时区分"谁拥有这个状态"：脚本自己设的（`selfMute` / `selfRate`）要维持，用户在 1500ms 内真实 pointerdown/keydown 之后改的（`muteOwned` / `rateOwned`）要认账——不能把他手动取消的静音再按回去。这套逻辑有一个 8 条断言的回归夹具：`.cdp/mute-unit-test.html` + `.cdp/run-mute-test.mjs`，逐条覆盖"第一条 / 播放器自己取消静音 / 他自己取消 / 他自己改 1.5x / 切下一条要重新静音 / 切下一条要重新 2x / 播放器自己重置倍速"。

### 4. 片尾是**原地重播**，不发 `ended`、不换 videoId

播放器循环，2 秒一轮，`ended` 事件刚好被跳过。完成判定只认这一个特征：

```js
// 上一轮还在片尾 30 秒内、这一轮往前掉回去 10 秒以上 ⇒ 判定播完
s.vid === prev && lastT >= s.d - 30 && s.t < lastT - 10
```

中途续播和主动重载都是**往前跳**，不会命中这个条件，所以不会误判。

### 5. 不抢屏幕只有一条路：headless

曾试过并**证明无效**的两条：
- `Target.activateTarget` / `Page.bringToFront` —— 它们的作用恰好是把窗口顶到所有应用之上，是"抢屏幕"的成因而不是解法；而且对**操作系统级遮挡**（窗口被别的程序盖住）毫无帮助。
- `--window-position=-30000,-30000` 把窗口挪出屏幕 —— Windows 会把越界坐标夹回屏内，等于没挪。

配合 `--disable-backgrounding-occluded-windows`、`--disable-features=CalculateNativeWinOcclusion`、`--disable-renderer-backgrounding`、`--disable-background-timer-throttling`、`--autoplay-policy=no-user-gesture-required`。

**可见性必须读原生 getter**，因为脚本自己伪造了 `document.visibilityState`：

```js
Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState').get.call(document)
```

同理，`emulateFocusEmulationEnabled` 会把可见性实验仿真掉，得到"假绿"的结论，做可见性相关实验时必须关掉。

### 6. `Page.addScriptToEvaluateOnNewDocument` 的两个坑

- 它**只在当前 CDP 会话内有效**，进程退出即失效 —— 所以注入脚本的守护进程必须常驻；
- 它**只作用于下一个文档** —— 复用已加载的标签页时必须 `Page.reload` 才生效。

### 7. 媒体域名与课程结构不同源

视频实际走 `prod.dsep.chonggsk.com/dsep/res/video/<courseId>/<videoId>.mp4?e=<过期戳>&token=<签名>`，是签名直链。签名串不进仓库、不打日志。

---

## 三、目录

| 路径 | 作用 |
| --- | --- |
| `runner.mjs` | 主程序：起 headless Chrome、独占标签页、按关卡顺序播完全部视频、落本地状态、跨关卡对账 |
| `verify.mjs` | 只读核验，输出平台侧完成度 |
| `.cdp/records.mjs` | 五门课账目对照，一条命令看全 |
| `.cdp/supervise.mjs` `.cdp/queue.mjs` | 守护 + 排队，多门课串跑 |
| `.cdp/cdp.mjs` | 最小 CDP 客户端（`WebSocket` + 自增 id + `pend` 表） |
| `.cdp/mute-unit-test.html` | 静音/倍速归属逻辑的回归夹具（8 断言） |
| `.cdp/verify-rate.mjs` `.cdp/watch-rate.mjs` | 倍速实测：时间序列采样，验证真实倍率 |
| `exercises.mjs` `answer.mjs` `export-exercises.mjs` | 练习题库读取与作答（见下节，当前被平台侧故障挡住） |
| `hailang-background-play.user.js` | 油猴脚本，独立可用 |

`.cdp/` 下另有一百多个一次性探针脚本，是上面每条结论的取证现场，保留是因为**它们的失败同样是信息**（比如 `why-nocredit.mjs`、`cold-1x-test.mjs`、`click-vs-navigate.mjs`、`test-1x-credit.mjs` 各自排除掉一个假设）。

## 四、自动答题（`answer-exercises.mjs`）

```bash
node answer-exercises.mjs --course 前端框架开发技术            # 只读：统计能答多少
node answer-exercises.mjs --course 前端框架开发技术 --apply    # 真正提交
node answer-exercises.mjs --course X --unit 使用生命周期函数 --apply   # 只做一个单元
```

**先前记的「`exercisesList`/`createList` 稳定 501 是平台故障」是错的，这里更正**：501 的内容是
`{"code":501,"msg":"操作ID不能为空"}` —— 是**我自己漏传了 `operationId`**。平台没坏。

章节习题的完整链路（每步都实测 200）：

```
1 POST study/studyRecordExercises/exerciseBarrier              {studentCourseId, unitId}
2 POST study/courseCatalogExercisesConfig/checkUpdateExercises {studentCourseId, courseId, majorId, unitId, version}
       -> data.operationId  (uuid，有效期 30 秒)
3 POST study/studyRecordExercises/exercisesList                {...}   -> 题目 + referenceAnswer
4 POST study/studyRecordExercises/createExercisesList          {poList, operationId, ...}   写入答案
5 POST study/studyRecordExercises/createList                   {poList, operationId, ...}   「提交练习」
6 POST study/studyRecordExercises/clearStudentUnit             {studentCourseId, unitId}    「返回/关闭」
```

**最容易踩的一条**：平台**同一时刻只允许一个"打开中"的章节习题会话**。`exercisesList` 本身就占这个名额，
没释放的话，对其它任何单元的调用都会返回

```
code:502  检测到您有正在进行中的【XX】章节习题，请前往…「提交练习」或点击页面内的「返回/关闭」退出
```

所以第 6 步不是可选的清理，而是**必须逐单元串行执行**的收尾 —— 少了它，一门 26 单元 67 道题的课会被误判成"只有 1 个单元有题"。

**三种客观题的参考答案格式各不相同**，判据必须分开写：

| 题型 | `referenceAnswer` | `optionVos` | 双证方式 |
| --- | --- | --- | --- |
| 1 单选 | 一个选项 id | 恰有一个 `answerFlag==1` | 两者必须完全相等 |
| 2 多选 | 选项 id 用 `|` 连接 | 多个 `answerFlag==1` | 集合排序后必须相等 |
| 3 判断 | 字面量 `"0"` / `"1"` | **空数组** | 无第二方证据，只校验取值域 |
| 7 编程 | 一段 HTML 高亮代码 | 空 | **跳过，不代做** |

只提交「客观题 + 判据通过 + 此前未作答」的题，因此重复运行是幂等的（实测跑两次，第二次显示"可提交 0 道"）。
当前状态：该课 67 道中 5 道已答、53 道可自动作答、9 道编程题跳过。

`exercises.mjs` / `answer.mjs` / `export-exercises.mjs` 是这条线上更早的尝试，接口族判断有错，保留作取证痕迹。

## 五、还没解决的问题：程序化播放不计入进度

## 五、边界

- 编程题要在本人名下提交，需要本人明确点头，工具默认只做预览；`--apply` 是显式开关。
- 协议勾选一类的同意动作交回本人完成。
- 仓库为私有；日志、运行状态、截图（含姓名/学号）、接口响应转储（含平台下发的参考答案）都在 `.gitignore` 里，不入库。
