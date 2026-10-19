# hailang-AutoCourse

重庆工程学院「海浪智学」学生端（`study.cqie.edu.cn/stu/home`）的课程学习自动化工具，附带对该平台**进度记账与答题接口机制**的实测记录。

零第三方依赖：只用 Node ≥ 24 内置的 `fetch` / `WebSocket` 直连 Chrome DevTools 协议，不用 Puppeteer / Playwright / Selenium；油猴面板不依赖本仓库其它部分，单独可用。

---

## 使用前请读

- 工具自动化的是**你自己账号上的真实学习行为**：视频照常播、题照常按平台下发的参考答案交。平台是否认定违规、由谁承担后果，属于使用者自己的判断，本仓库不提供任何保证。
- 一人一号。这个平台**单会话**，共享账号会互相顶下线，而且记录会混在一起。
- 仓库里**不含任何人的姓名、学号、登录令牌、运行日志和截图**（见第七节）。所有示例里的课程名和题号都是公开课件内容。

---

## 一、两种形态

### A. 油猴面板（推荐给同学，不需要 Node）

`hailang-panel.user.js`（当前 v0.5.3）。装进 Tampermonkey 后，在学习页右下角出现面板：

| 能力 | 说明 |
| --- | --- |
| 账号与每门课缺口 | 直接读服务端 `myCourseDetails` 的秒数，不信界面百分比 |
| 勾选课程排队刷 | 串行，一次只刷一门；当前那门标「正在刷 第 x/y 条」 |
| 自动起播 | 合成手势打在 `document.elementFromPoint` 命中的元素上，实测服务端记账 |
| 2 倍速 + 声音三态 | 静音 / 微声保活（音量 0.02，换 Chrome 后台豁免）/ 开 |
| 切窗口接手 | 站点播放器失焦会自己 `pause`，面板在同一个事件里同步接手 |
| 片尾自己跳下一条 | 站点到片尾会弹「有习题待完成」并停住，面板关掉弹窗后跳下一条 |
| 做客观题 | 章节习题 + 知识练习，只交「平台下发参考答案 + 与选项双证一致」的题 |
| 自证仪表 | 页脚：心跳 / 监控 / 接手 / 暂停事件 / 定时器最大迟到，用来分清责任 |

安装：Tampermonkey → 新建脚本 → 粘贴文件全文 → 保存 → 刷新学习页；标题栏显示版本号才算装上。

只要"切到后台别停"的话，用更小的 `hailang-background-play.user.js`：后台续播 + 每条视频默认静音 + 默认 2 倍速，没有面板界面。

### B. 长跑脚本（本机批量，需要 Node）

```bash
node runner.mjs --course <课程名>            # 起 headless Chrome，按关卡顺序播完全部视频
node preflight.mjs                           # 只读自检：这个账号的课能不能被现有分支处理
node verify.mjs --course <课程名>            # 只读核验：打印平台自己认的账
node .cdp/inventory.mjs <课程名>             # 只读盘点：单元数/题目数/已答/可自动作答/题型分布
node answer-exercises.mjs --course <课程名>          # 只读统计
node answer-exercises.mjs --course <课程名> --apply  # 真正提交
node answer-knowledge.mjs --course <课程名> --apply  # 知识练习（分段知识点层）
node answer-codeq.mjs --course <课程名> --apply      # 编程题（只交平台有答案的）
node answer-design.mjs --course <课程名> --apply     # 设计题（需要本地产物，见脚本头注释）
```

所有脚本都支持 `--cdp http://127.0.0.1:<端口>`，默认 `9224`。多门课串跑用 `.cdp/supervise.mjs` + `.cdp/queue.mjs`，停车用 `powershell -File .cdp/stop-jobs.ps1`。

### 换一门没见过的课、换一个账号

课程**不是白名单**。每个脚本都用当前登录账号的 `pagedMyCourse` 现取课程清单，再从课程对象上取 `id / studentCourseId / version`，`majorId` 与学号从 `userInfo2` 取，所以任何一门能在这个账号里列出来的课都可以直接进。两处例外要自己改：

- `.cdp/queue.mjs` 里写死了五门课的串跑队列（那是当前学期我自己的清单），`.cdp/records.mjs` 是同一批课的对账表；
- `runner.mjs` 用**课程全名精确匹配**（`c.name === COURSE`），名字里一个空格或全角括号不同就报「没找到课程」并把可选清单打出来；其余脚本用子串匹配。

先跑 `node preflight.mjs`，它专门回答换账号后的四个未知项，退出码 3 表示"跑完了但有需要人判的项"：

| 未知项 | 现有分支的边界 |
| --- | --- |
| `version` 从哪来 | 优先取课程对象自己的值；取不到时兜底 `BK_RJGC_2024`，这是 2024 级软件工程的培养方案版本号，换专业/换年级不成立 |
| 课程结构 | 闯关制走 `listCourseBarrier`，返回 0 个关卡时回落 `courseCatalog/tree` 按 `videoCount>0` 取单元；两条路都漏的第四种结构，它会报"这门课一个单元都没枚举到"而不是静当成没内容 |
| 题型 | 只实现了 1 单选 / 2 多选 / 3 判断（直接搬参考答案）、5 简答 / 6 问答（要 `--subjective` 才交）、7 编程与 8 设计（要本地产物，走 `answer-codeq` / `answer-design`）。出现集合外的题型编号，它标 `[未实现]` 并计入未知项 |
| 参考答案覆盖率 | 逐题型统计 `referenceAnswer` 有没有，把"能搬的"和"必须自己造的"分开；没有参考答案的题，脚本一律不交 |

两个已知判据缺口：`pagedMyCourse` 分页只取前 50 门；分段关卡制的课（实测《前端框架开发技术》）目录层每条视频的 `haveTime` 恒为 0，这类课只能退回课程级 `myCourseDetails.haveTime/sumTime` 判完成，不能按条判。

`.cdp/` 下的面板探针脚本（`panel-*.mjs`、`test-*.mjs`）现在按相对路径读脚本全文，**要在仓库根目录下执行**。


---

## 二、平台机制实测（这个仓库真正的价值在这部分）

### 1. 鉴权不在 Cookie

登录态是 `localStorage.token2` 里的一枚 JWT，**没有 `exp`**，所以关掉浏览器重开还在。所有请求靠 `Authorization: <token2>` 头，Cookie 参与不了。令牌本身不入库、不打日志。

一个账号**只允许一个活跃会话**。别处登录会把这边顶掉，返回体是 `code:488 / "当前账号于 HH:MM 在其他设备上登录,此客户端已退出登录。"`；被顶掉之后读接口仍然回 200 但没有数据，很容易误判成"课没了"，所以 `runner.mjs` 里有一个 `guard()` 专门识别它并以退出码 4 终止，不做无谓重试。

### 2. 起播的记账开关：打在"真正会被点到的元素"上

这是踩了两轮才挖清楚的一条。站点的播放键 `.d-play-btn` 被一层透明的 `INPUT.d-player-input` 盖着，`document.elementFromPoint` 在播放键中心命中的是那个 `INPUT`。

- 事件打在 `.d-play-btn` 自己身上 → 进不了播放器组件的状态机 → 零心跳、零记账
- 事件打在 `elementFromPoint` 命中的元素上 → **合成事件（`isTrusted=false`）照样记账**：实测一条 0 秒未记的视频，180 秒里服务端 `haveTime` +268 秒，`updateStudyVideoPlan` 全部 HTTP 200
- 单独调 `video.play()` → 画面在动但组件状态机停在"暂停" → 零心跳

所以"脚本代点不计时长、必须真人点一下"这个说法是错的，真正的原因是命中元素不对。

### 3. `haveTime` 是**按秒累计**的，而且有两条陷阱

- 它随真实观看秒数增长，不是"看完才结算"；2 倍速下 60 秒墙钟涨约 90~120 秒视频时长。
- **每条视频各自有上限**：`progressDetails` 的视频节点带自己的 `haveTime`，等于 `timeLength` 就是记满，再播一秒也不涨。拿一条已记满的视频做实验，永远量到"+0"，会被误判成"工具没生效"。
- 但**分段关卡制的课**（如前端框架开发技术）目录层 `haveTime` 恒为 0，这类课只能退回课程级 `myCourseDetails.haveTime/sumTime` 判。

### 4. 播放器会**复用同一个 `<video>` 元素**

切下一条不换 DOM 节点，只换 `src`，并且**把 `muted` 和 `playbackRate` 重置回默认**。这就是"第一条静音了，下一条又有声音"的根因——任何"每个元素只处理一次"（`WeakSet` 标记一次就不再管）的写法在这个播放器上必然漏。

正确做法是**以"视频身份"为键而不是以"元素"为键**：

```js
const keyOf = (v) => v.currentSrc || v.src || '';
// src 变了 ⇒ 判定为新的一条视频 ⇒ 重新施加默认静音 / 默认倍速
// src 没变 ⇒ 是同一条，绝不覆盖用户在这一条里的手动选择
```

同时区分"谁拥有这个状态"：脚本自己设的要维持，用户在约 1.5 秒内真实 pointerdown/keydown 之后改的要认账——不能把他手动取消的静音再按回去。这套逻辑有 8 条断言的回归夹具：`.cdp/mute-unit-test.html` + `.cdp/run-mute-test.mjs`。

### 5. 片尾是**原地重播**，不发 `ended`、不换 videoId

播放器循环，2 秒一轮，`ended` 事件刚好被跳过。完成判定只认这一个特征：

```js
// 上一轮还在片尾 30 秒内、这一轮往前掉回去 10 秒以上 ⇒ 判定播完
s.vid === prev && lastT >= s.d - 30 && s.t < lastT - 10
```

中途续播和主动重载都是**往前跳**，不会命中这个条件，所以不会误判。

顺带一条实测教训：片尾判据**不许提前**。曾经写成 `currentTime >= duration - 1.5` 就跳下一条，结果每条视频都被提前 1.5 秒拽走，服务端记成"差 1 秒没看完"，得人工拖到最后才算完成。

### 6. 不抢屏幕只有一条路：headless 或遮挡豁免

曾试过并**证明无效**的两条：

- `Target.activateTarget` / `Page.bringToFront` —— 它们的作用恰好是把窗口顶到所有应用之上，是"抢屏幕"的成因而不是解法；对操作系统级遮挡毫无帮助。
- `--window-position=-30000,-30000` 把窗口挪出屏幕 —— Windows 会把越界坐标夹回屏内，等于没挪；而且挪出去之后页面会被判成 `hidden`，可信输入反而送不进渲染进程。

真正有效的是这几个启动参数：`--disable-backgrounding-occluded-windows`、`--disable-features=CalculateNativeWinOcclusion`、`--disable-renderer-backgrounding`、`--disable-background-timer-throttling`，headless 时再加 `--autoplay-policy=no-user-gesture-required`。

**可见性必须读原生 getter**，因为脚本自己伪造了 `document.visibilityState`：

```js
Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState').get.call(document)
```

同理，`Emulation.setFocusEmulationEnabled` 会把可见性仿真掉，得到"假绿"的结论，做可见性实验时必须关掉。

### 7. 后台标签被 Chrome 挂起，脚本救不了

Chrome 只给**正在发声**的标签豁免定时器节流与内存节省挂起。纯静音的视频会被当后台处理，这时页面里的脚本自己也被冻住——任何续播逻辑都跑不到。所以面板提供「微声保活」（不静音、音量 0.02）。另外，屏幕外的窗口 = native hidden，此时 CDP 的 `Input.*` 事件不会送进渲染进程，做输入类实验必须先把窗口挪回屏内。

### 8. 媒体域名与课程结构不同源

视频实际走 `prod.dsep.chonggsk.com/dsep/res/video/<courseId>/<videoId>.mp4?e=<过期戳>&token=<签名>`，是签名直链。签名串不进仓库、不打日志。

---

## 三、答题接口链路

### 章节习题（`answer-exercises.mjs`）

```
1 POST study/studyRecordExercises/exerciseBarrier              {studentCourseId, unitId}
2 POST study/courseCatalogExercisesConfig/checkUpdateExercises {studentCourseId, courseId, majorId, unitId, version}
       -> data.operationId  (uuid，有效期约 30 秒)
3 POST study/studyRecordExercises/exercisesList                {...}   -> 题目 + referenceAnswer
4 POST study/studyRecordExercises/createExercisesList          {poList, operationId, ...}   写入答案
5 POST study/studyRecordExercises/createList                   {poList, operationId, ...}   「提交练习」
6 POST study/studyRecordExercises/clearStudentUnit             {studentCourseId, unitId}    「返回/关闭」
```

三条硬规矩，都是实测出来的：

- **不领 `operationId` 就提交会返回 `code:501 操作ID不能为空`** —— 这是漏传参数，不是平台故障。
- **平台同一时刻只允许一个"打开中"的章节习题会话**。`exercisesList` 本身就占这个名额，没释放的话其它单元的调用全回 `code:502 检测到您有正在进行中的【XX】章节习题…`。所以第 6 步是**必须逐单元串行**的收尾，少了它一门 26 单元的课会被误判成"只有 1 个单元有题"。
- **回读前必须再 `exerciseBarrier` 一次**，否则多数单元返回空列表，会把成功的提交读成失败。

四种题型的参考答案格式不同，判据必须分开写：

| 题型 | `referenceAnswer` | `optionVos` | 双证方式 |
| --- | --- | --- | --- |
| 1 单选 | 一个选项 id | 恰有一个 `answerFlag==1` | 两者必须完全相等 |
| 2 多选 | 选项 id 用 `|` 连接 | 多个 `answerFlag==1` | 集合排序后必须相等 |
| 3 判断 | 字面量 `"0"` / `"1"` | **空数组** | 无第二方证据，只校验取值域 |
| 7 编程 | 一段 HTML 高亮代码 | 空 | 交代码压缩包，见 `answer-codeq.mjs` |

只提交「客观题 + 判据通过 + 此前未作答」的题，所以重复运行是幂等的（跑两次，第二次"可提交 0 道"）。

### 知识练习（`answer-knowledge.mjs`）

挂在视频分段知识点上，枚举链路：`progressDetails` → 视频 → `videoSegmentKnowledgeTimeRanges[].id` → `studyKnowledgeExerciseRecord/check` → `exercisesList`。提交走 `studyKnowledgeExerciseSummaryRecord/createList`，其中 **`segmentKnowledgeId` 必须放在请求体外层**（一组一个分段）；塞进 `poList` 元素里会被静默忽略，服务端报 `Field 'segment_knowledge_id' doesn't have a default value`。

### 设计题与编程题（`answer-design.mjs` / `answer-codeq.mjs`）

产物目录约定 `design-output/<题目id>/`：`答案.txt` 进 `submitAnswer`，其余文件打成 `<qid>.zip` 走 `POST /gateway/file/studyRecordExercises/uploadCodeZip` 换 `fileId` 进 `submitFile`。按内容哈希复用 `fileId`，避免重复堆孤儿压缩包。

**服务端自己拥有的字段绝不能硬编码**：`recordId` 填错会让新提交被旧记录遮住，`updateCount` 填错会被判 `code:917 题目已更新，请重新做题`。两处都是踩过、已经改成从题目行原样回填的。

### 两档授权，分开开关

- **回填平台下发的参考答案**（`--ref-answer`、`answer-codeq` 默认行为）：内容是平台给的，性质轻。
- **把生成的内容以账号主人名义提交**（`design-output/` 自造产物、`essay-output/` 自写简答、`--with-authored` 手写工程）：性质重，必须显式开启，默认不做。

### 核验

`--apply` 之后一定回读：重新拉一次列表，数**服务端自己的** `submitAnswer` / `submitFile` / `submitTime`，逐单元打 `已答 before → after（期望 ≥…）`，不达标以退出码 4 结束。回读判据不许读"我刚写进去的那个字段"——自己填的值也算 truthy，会把没落库的报成落库的。

---

## 四、目录

| 路径 | 作用 |
| --- | --- |
| `hailang-panel.user.js` | 油猴任务面板（播放 + 做客观题），独立可用 |
| `hailang-background-play.user.js` | 极简油猴脚本：后台续播 + 静音 + 2 倍速 |
| `runner.mjs` | 主程序：起 headless Chrome、按关卡顺序播完、落本地状态、跨关卡对账 |
| `verify.mjs` | 只读核验，输出平台侧完成度 |
| `answer-exercises.mjs` / `answer-knowledge.mjs` / `answer-codeq.mjs` / `answer-design.mjs` | 四层答题 |
| `state-path.mjs` | 状态文件按学号拆分：`.runner-state-<学号>.json`（不入库） |
| `zip-store.mjs` | 无依赖 ZIP 打包（store 模式） |
| `.cdp/inventory.mjs` | 只读盘点器：单元数、题目数（含去重）、已答、可自动作答、题型分布 |
| `.cdp/cdp.mjs` | 最小 CDP 客户端（`WebSocket` + 自增 id + `pend` 表） |
| `.cdp/launch-visible.ps1` / `launch-headless.ps1` / `start-keeper.ps1` / `stop-jobs.ps1` | 起实例、起常驻注入器、停车 |
| `.cdp/inject-keeper.mjs` | 给没装 Tampermonkey 的实例持续注入面板；带锁文件、服务端权威判据、DONE/STALL/ABORT 三种停车 |
| `.cdp/mute-unit-test.html` | 静音/倍速归属逻辑的回归夹具（8 断言） |
| `.cdp/*.mjs` 其余 | 一次性取证探针。保留是因为**它们的失败同样是信息**：`panel-resume.mjs`、`trusted-vs-synthetic.mjs` 是两轮**无效测量**（窗口在屏幕外导致可信输入没送达），文件头写明"别拿这种环境下的 +0 当结论"；`panel-resume2.mjs`、`hb-resp.mjs`、`per-video-have.mjs` 才是把错误结论查穿的那几个 |
| `exercises.mjs` / `answer.mjs` / `export-exercises.mjs` | 答题链路更早的尝试，接口族判断有错，保留作取证痕迹 |

---

## 五、常见误判清单（都是我自己犯过的）

| 现象 | 真实原因 |
| --- | --- |
| "脚本代点不计时长" | 事件打在了被透明控件盖住的按钮上，没打在 `elementFromPoint` 命中的元素上 |
| 某门课反复量到 `haveTime +0` | 样本那条视频早已记满 |
| "这门课没题" | 取单元的接口走错了分支：非闯关制课 `listCourseBarrier` 返回空，必须回落 `courseCatalog/tree` |
| 关卡接口算出的缺口偏小 | 它漏掉没有子节点的顶层关卡（实测整棵树 41 条、关卡接口只给 40 条，缺的是「课程介绍」） |
| 提交返回 501 | 自己漏传 `operationId`，不是平台故障 |
| 只有 1 个单元有题 | 没逐单元 `clearStudentUnit`，后面的单元全被 502 挡住 |
| 界面显示 100% 但时长有缺口 | `learned` 百分比最不可信，要用原始秒数 |
| 可信点击"没反应" | 窗口在屏幕外 → 页面 native hidden → CDP 输入不进渲染进程 |
| 报"服务端拒绝了我" | 先证明我自己那发请求的 headers / body 齐全，再怪服务端 |

---

## 六、环境变量

| 变量 | 默认 | 作用 |
| --- | --- | --- |
| `CDP_BASE` / `--cdp` | `http://127.0.0.1:9224` | DevTools 端口 |
| `HAILANG_HEADLESS=0` | headless | 改成有窗口模式（调试用） |
| `HAILANG_RATE=1` | 2 | 注入前覆盖默认倍速 |
| `KEEP_WINDOW_ONSCREEN=1` | 挪到屏幕外 | 让窗口留在屏内（可见性实验必须开） |
| `ALLOW_FOREGROUND=1` | 不抢屏幕 | 允许在媒体加载不出来时把窗口提到前台 |

---

## 七、隐私处理

公开仓库前已做和待做的处理：

- **不入库**（`.gitignore` 已挡）：`*.png` 截图（可能含姓名/学号）、`*.log` 运行日志、`.runner-state*.json`（按学号拆的学习进度状态）、`.cdp/knowledge-answers/` 与 `.cdp/design/`（含平台下发参考答案的接口转储）、注入器锁文件、`design-output/**/target/` 编译产物。
- 代码里的账号标识一律从 `localStorage.userInfo2` 运行时读取，不含硬编码的姓名或学号。
- 登录令牌不出现在源码、日志和本文档里。
- 本文档中的课程名、题号、时长数字均为公开课件内容或已去除身份指向的实测值。
