# hailang-study-automation

重庆工程学院「海浪智学」学生端（`study.cqie.edu.cn/stu/home`）的课程学习自动化工具，附带对该平台**进度记账与答题接口机制**的实测记录。

零第三方依赖：只用 Node ≥ 24 内置的 `fetch` / `WebSocket` 直连 Chrome DevTools 协议，不用 Puppeteer / Playwright / Selenium；油猴面板不依赖本仓库其它部分，单独可用。

## 2026-11-19 面板 v0.5.6：状态机收口

- 片尾弹窗的真实文案是「知识点：… 有习题：(2题) 待完成」，旧正则 `/有习题待完成/` 永远匹配不到，等于这个框从未被关过。现在允许中间夹题数；回归夹具也改成了真实文案。
- 面板自己的起播手势也是 `pointerdown`，以前会被当成"他 3 秒内碰过播放器"，紧接着站点失焦暂停就不接手。现在只认真实输入（`isTrusted`），并在 1.5 秒窗口内尊重他手改的倍速/音量；归属按视频身份记，换下一条恢复默认档。
- 单门课读时长失败不再拖垮整个课程列表，也不会被 `scan().catch(pauseTask)` 顺手暂停任务；该课显示「时长未知」。课程列表只按 `total` 或空页收尾，不再用「本页不足 50 条」猜。
- 暂停后点「开始」现在是**继续**（保留 `i` / `skipped`），不是从第一门重刷；启动时把暂停原因打印出来。新增「跳过本门」：时长判据对不上（如「课程介绍」不计 `haveTime`）时人工跳过，记录进 `job.skipped`，不假装完成。
- 习题按单元隔离失败（对齐 CLI）；空单元 `data:null` 当"没题"；释放习题会话失败不吞原始错误。「没读到」与「没记上」分开报，两者都不算成功。
- 自动起播开关关掉时，「停着呢」仍会被检测出来用于按钮提示，只是不自动发手势。

## 2026-11-03 修复：面板 v0.5.5

- 接口超时、登录失效、响应缺失不再按「没有内容 / 已完成」处理；任务会暂停并保留。处理原因后点「开始」重新核对。换账号不自动恢复旧任务。
- 最后一条视频结束后先核对课程时长，再按开关做客观题，确认后才换课。答题回读按本次题目 ID 和答案逐项核验；旧答案不抵扣新提交，读不到结果属于未核验。
- 习题会话在异常时也会尝试释放；任务停止后，尚未完成的异步流程不能重新创建队列。已发出的请求可能已经到达服务端，停止不会撤销已提交的数据。
- 片尾同时监听媒体事件和循环回跳；只关闭学习任务中的「… 有习题：(N题) 待完成」提示。多个标签页通过 Web Locks 限制为一个控制页；没有控制权时使用正在运行的标签页，或关闭它后刷新本页。
- 主流程课程列表支持翻页；缺少课程版本时停止，避免套用其他年级或专业的默认版本。部分历史探针和 `preflight.mjs` 仍保留原有枚举与版本兜底，只作诊断。
- Node 主流程和章节/知识练习脚本增加 HTTP、业务错误和 CDP 超时处理。非闯关课程同样核对时长并执行 `--answer`；答题子进程沿用 `--cdp`，失败状态向上传递。
- runner 退出码：`0` 完成，`1` 环境/参数/页面异常，`3` 仍有可重试缺口，`4` 登录失效，`5` 时长或课程版本需要人工核验，`6` 答题未确认成功（答题子进程的 `4` 会映射成 `6`）。守护进程遇到 `4/5/6` 停止重试并返回非零；连续 5 分钟无输出会终止本轮 runner 再试。

离线回归测试（模拟页面与接口，不连接学校网站）：

```bash
node --test tests/regression.test.mjs
```

本轮没有进行登录后现网写入验证。更新油猴脚本时替换全文并刷新，面板标题应显示 `v0.5.6`。

## 2026-11-19 硬化：答题链路、守护进程与文档

同样没有做登录后现网写入验证；离线回归 24 条全绿。

- 答题脚本：单单元/单分段失败不再整批中止；`{code:200,data:null}` 按「没有题」处理；被顶下线（401/403/488）立即停止并以 `4` 退出。
- **未核验按失败计**：codeq/design 只有「全部回读命中且内容一致」才退出 `0`；读不到题目不再算成功。design 的答案文本要求回读实质一致，不再只看长度。
- design 提交本地产物现在必须显式 `--with-authored`（与下文「两档授权」一致）；平台参考答案走 `--ref-answer` 不受影响。
- 课程缺 `version` 时 design 跳过该课并以 `5` 退出，不再套用 `BK_RJGC_2024` 之类的默认版本。
- `answer-knowledge` 的归档目录与 runner 标签页锁修正回仓库内；`.cdp/knowledge-answers/` 已加入 `.gitignore`。
- runner：课程时长缺失/格式异常直接 `5`；结构性缺口（补播两轮仍不涨账，如「课程介绍」）不再烧满 60 轮；非闯关课时只退回本轮枚举到的节点，不误清同账号其他课程。
- 守护进程：看门狗在 Windows 用 `taskkill /T /F` 终止整棵进程树；队列不再因旧的「需要人工处理」末行永久卡死（`capped` 需显式 `--retry-capped`）。
- `--dry --answer-only` 不再启动答题子进程；答题子进程优先使用 runner 锁定标签页，并全程校验账号没有中途变化。
- 答题 CLI 退出码：`0` 完成；`1` 参数/环境/页面异常；`4` 回读未达标或未核验（runner 映射为 `6`）；`5` 课程版本或时长需人工核验（design）。

---

## 使用前请读

- 工具自动化的是**你自己账号上的真实学习行为**：视频照常播、题照常按平台下发的参考答案交。平台是否认定违规、由谁承担后果，属于使用者自己的判断，本仓库不提供任何保证。
- 一人一号。这个平台**单会话**，共享账号会互相顶下线，而且记录会混在一起。
- 仓库里**不含任何人的姓名、学号、登录令牌、运行日志和截图**（见第七节）。所有示例里的课程名和题号都是公开课件内容。

---

## 一、两种形态

### A. 油猴面板（推荐给同学，不需要 Node）

`hailang-panel.user.js`（当前 v0.5.6）。装进 Tampermonkey 后，在学习页右下角出现面板：

| 能力 | 说明 |
| --- | --- |
| 账号与每门课缺口 | 直接读服务端 `myCourseDetails` 的秒数，不信界面百分比 |
| 勾选课程排队刷 | 串行，一次只刷一门；当前那门标「正在刷 第 x/y 条」 |
| 自动起播 | 合成手势打在 `document.elementFromPoint` 命中的元素上，实测服务端记账 |
| 2 倍速 + 声音三态 | 静音 / 微声保活（音量 0.02，换 Chrome 后台豁免）/ 开 |
| 切窗口接手 | 站点播放器失焦会自己 `pause`，面板在同一个事件里同步接手 |
| 片尾自己跳下一条 | 站点到片尾会弹「… 有习题：(N题) 待完成」并停住，面板关掉弹窗后跳下一条 |
| 做客观题 | 章节习题 + 知识练习，只交「平台下发参考答案 + 与选项双证一致」的题 |
| 暂停与继续 | 接口失败/登录失效时暂停并保留 `i`；处理后点「开始」从原位置继续，不重刷已完成的课 |
| 跳过本门 | 时长判据对不上（如「课程介绍」不计 `haveTime`）时人工跳过，记录进 `job.skipped`，不记为已完成 |
| 手动声音/倍速归属 | 你亲手调过的这一条视频内不按回去；换下一条恢复默认档 |
| 开关记忆 | 自动起播 / 刷完自动做题 / 声音档存 `localStorage.kg-prefs`；跳下一条视频是整页重载，不存就会每次换视频都退回默认（实测过这个坑） |
| 自证仪表 | 页脚：心跳 / 监控 / 接手 / 暂停事件 / 定时器最大迟到，用来分清责任 |

安装：Tampermonkey → 新建脚本 → 粘贴文件全文 → 保存 → 刷新学习页；标题栏显示版本号才算装上。

只要"切到后台别停"的话，用更小的 `hailang-background-play.user.js`：后台续播 + 每条视频默认静音 + 默认 2 倍速，没有面板界面。

### B. 长跑脚本（本机批量，需要 Node）

```bash
node runner.mjs --course <课程名>            # 起 Chrome，按关卡顺序播完全部视频（默认可见窗口，方便登录）
node runner.mjs --course <课程名> --headless # 无人值守（profile 里必须已经登录过）
node preflight.mjs                           # 只读自检：这个账号的课能不能被现有分支处理
node verify.mjs --course <课程名>            # 只读核验：打印平台自己认的账
node .cdp/inventory.mjs <课程名>             # 只读盘点：单元数/题目数/已答/可自动作答/题型分布
node answer-exercises.mjs --course <课程名>          # 只读统计
node answer-exercises.mjs --course <课程名> --apply  # 真正提交
node answer-knowledge.mjs --course <课程名> --apply  # 知识练习（分段知识点层）
node answer-codeq.mjs --course <课程名> --apply      # 编程题（只交平台有答案的）
node answer-design.mjs --course <课程名> --apply --ref-answer     # 设计题：只提交平台下发的参考答案
node answer-design.mjs --course <课程名> --apply --with-authored  # 连 design-output/ 里自造的产物一起交（重授权）
```

`--cdp http://127.0.0.1:<端口>`（默认 `9224`）由主流程与答题脚本支持；`.cdp/inventory.mjs`、`.cdp/records.mjs`、`.cdp/cdp.mjs` 和三个旧脚本（`exercises.mjs` / `answer.mjs` / `export-exercises.mjs`）只认 `CDP_BASE` 环境变量。多门课串跑用 `.cdp/supervise.mjs` + `.cdp/queue.mjs`，停车用 `powershell -File .cdp/stop-jobs.ps1`。

### 换一门没见过的课、换一个账号

课程**不是白名单**。每个脚本都用当前登录账号的 `pagedMyCourse` 现取课程清单，再从课程对象上取 `id / studentCourseId / version`，`majorId` 与学号从 `userInfo2` 取，所以任何一门能在这个账号里列出来的课都可以直接进。两处例外要自己改：

- `.cdp/queue.mjs` 里写死了五门课的串跑队列（那是当前学期我自己的清单），`.cdp/records.mjs` 是同一批课的对账表；
- 课程名匹配分三档：`runner.mjs`、`verify.mjs` 用**全名精确匹配**（名字里一个空格或全角括号不同就报「没找到课程」并打出可选清单）；`answer-exercises.mjs`、`answer-codeq.mjs` 是**先精确、再子串**；`answer-knowledge.mjs`、`answer-design.mjs`、`preflight.mjs` 用**子串**。

先跑 `node preflight.mjs`，它专门回答换账号后的四个未知项。退出码：`0` 全部可判定，`1` 环境/登录问题，`2` 登录态被顶掉，`3` 跑完了但有需要人判的项：

| 未知项 | 现有分支的边界 |
| --- | --- |
| `version` 从哪来 | 主流程只用课程对象的版本，缺失即停；`preflight.mjs` 的诊断仍有 `BK_RJGC_2024` 兜底，这仅适用于原账号的培养方案，不能据此确认其他专业可运行 |
| 课程结构 | 闯关制走 `listCourseBarrier`，返回 0 个关卡时回落 `courseCatalog/tree` 按 `videoCount>0` 取单元；两条路都漏的第四种结构，它会报"这门课一个单元都没枚举到"而不是静当成没内容 |
| 题型 | 只实现了 1 单选 / 2 多选 / 3 判断（直接搬参考答案）、5 简答 / 6 问答（要 `--subjective` 才交）、7 编程与 8 设计（要本地产物，走 `answer-codeq` / `answer-design`）。出现集合外的题型编号，它标 `[未实现]` 并计入未知项 |
| 参考答案覆盖率 | 逐题型统计 `referenceAnswer` 有没有，把"能搬的"和"必须自己造的"分开；没有参考答案的题，脚本一律不交 |

主流程与四个答题脚本已支持 `pagedMyCourse` 翻页；`verify.mjs`、`.cdp/inventory.mjs`、`preflight.mjs` 仍只读第一页 50 门（诊断用途，超过 50 门会漏）。仍有一个判据限制：分段关卡制的课（实测《前端框架开发技术》）目录层每条视频的 `haveTime` 恒为 0，这类课只能退回课程级 `myCourseDetails.haveTime/sumTime` 判完成，不能按条判。

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

同时区分"谁拥有这个状态"：脚本自己设的要维持，用户在约 1.5 秒内真实 pointerdown/keydown 之后改的要认账——不能把他手动取消的静音再按回去。这套逻辑有 8 条断言的回归夹具：`.cdp/mute-unit-test.html` + `.cdp/run-mute-test.mjs`；面板 v0.5.6 也按同一套规则实现，并额外排除面板自己发出的合成手势（`isTrusted=false`）。

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
| `runner.mjs` | 主程序：起 Chrome（默认可见，`--headless` 无人值守）、按关卡顺序播完、落本地状态、跨关卡对账 |
| `runtime.mjs` | 共享传输层：CDP 客户端（带超时）、同源请求、课程翻页、课程时长差 |
| `preflight.mjs` | 只读自检：换账号后的四个未知项（版本/结构/题型/答案覆盖率） |
| `verify.mjs` | 只读核验，输出平台侧完成度（课程名精确匹配） |
| `tests/regression.test.mjs` | 离线回归（24 条）：模拟页面与接口，不连接学校站点 |
| `answer-exercises.mjs` / `answer-knowledge.mjs` / `answer-codeq.mjs` / `answer-design.mjs` | 四层答题 |
| `state-path.mjs` | 状态文件按学号拆分：`.runner-state-<学号>.json`（不入库） |
| `zip-store.mjs` | 无依赖 ZIP 打包（store 模式） |
| `.cdp/inventory.mjs` | 只读盘点器：单元数、题目数（含去重）、已答、可自动作答、题型分布 |
| `.cdp/cdp.mjs` | 最小 CDP 客户端（`WebSocket` + 自增 id + `pend` 表） |
| `.cdp/launch-visible.ps1` / `launch-headless.ps1` / `start-keeper.ps1` / `stop-jobs.ps1` | 起实例、起常驻注入器、停车 |
| `.cdp/inject-keeper.mjs` | 给没装 Tampermonkey 的实例持续注入面板；带锁文件、服务端权威判据、DONE/STALL/ABORT 三种停车 |
| `.cdp/mute-unit-test.html` | 静音/倍速归属逻辑的回归夹具（8 断言） |
| `.cdp/test-prefs-persist.mjs` | 开关记忆的端到端回归（11 断言）：自带临时 profile 与本地夹具站点，动态端口、按 profile 杀整棵 Chrome 进程树；版本号从面板脚本头读取 |
| `.cdp/records.mjs` | 当前学期五门课的对账表（与队列同一批课） |
| `.cdp/*.mjs` 其余 | 一次性取证探针，文件保持原位；按主题与结论的完整索引见 `archive/README.md`。保留是因为**它们的失败同样是信息**：`panel-resume.mjs` 是 v0.3.2/0.3.3 的 A/B 与最小化窗口取证；`trusted-vs-synthetic.mjs` 的结论在运行时判定（合成事件打在 `elementFromPoint` 命中的元素上仍记账）；「窗口在屏幕外导致可信输入没送达」的归因写在 `panel-resume2.mjs` 文件头；`hb-resp.mjs`、`per-video-have.mjs` 才是把「+0」查穿的那几个 |
| `archive/README.md` | 探针归档索引：21 个工具脚本与约 260 个历史探针按主题分组，标明各自结论入口 |
| `design-output/` / `essay-output/` / `diagrams/` | 设计题、简答、图表的本地产物（重授权，默认不提交；UML 图是 `.gitignore` 里 `*.png` 的唯一例外） |
| `exercises.mjs` / `answer.mjs` / `export-exercises.mjs` | 答题链路更早的尝试，接口族判断有错，保留作取证痕迹 |

---

## 五、常见误判清单（都是我自己犯过的）

| 现象 | 真实原因 |
| --- | --- |
| "脚本代点不计时长" | 事件打在了被透明控件盖住的按钮上，没打在 `elementFromPoint` 命中的元素上 |
| 某门课反复量到 `haveTime +0` | ① 样本那条视频早已记满；② 窗口在屏幕外 → 页面 native hidden → Chrome 推迟媒体加载，等于没播 |
| "这门课没题" | 取单元的接口走错了分支：非闯关制课 `listCourseBarrier` 返回空，必须回落 `courseCatalog/tree` |
| 接口超时/响应缺失被当成"没有内容/已完成" | 把异常和"空"混为一谈；必须区分"读不到"与"确实没有"，未核验一律按失败处理 |
| 提交返回 917「题目已更新」 | `updateCount` 用了旧值；必须从服务端题目行原样回填（与 501 同类：自己漏传/填错字段） |
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
| `CDP_BASE` / `--cdp` | `http://127.0.0.1:9224` | DevTools 端口（`--cdp` 仅主流程与答题脚本支持） |
| `HAILANG_RATE=1` | 2 | 注入前覆盖默认倍速 |
| `KEEP_WINDOW_ONSCREEN=1` | 挪到屏幕外 | 让窗口留在屏内（可见性实验必须开） |
| `ALLOW_FOREGROUND=1` | 不抢屏幕 | 允许在媒体加载不出来时把窗口提到前台 |

无人值守用 `runner.mjs --headless`（这是 CLI 参数，没有同名环境变量）。`.cdp/queue.mjs` 对历史日志里的「达到重启上限」默认跳过，确认成因后加 `--retry-capped` 再试；「需要人工处理」则在下次启动队列时自动重试。

---

## 七、隐私处理

公开仓库前已做和待做的处理：

- **不入库**（`.gitignore` 已挡，规则须与代码同一次提交）：`*.png` 截图（可能含姓名/学号；唯一例外是 `design-output/**/*.png` 里自绘的 UML 图）、`*.log` 运行日志、`.runner-state*.json`（按学号拆的学习进度状态）、`.cdp/knowledge-answers/`、`.cdp/design/`、`.cdp/codeq/`（含平台下发参考答案或账号绑定的 fileId）、`.cdp/*.json` 接口转储、注入器锁文件、`design-output/**/target/` 编译产物。
- `essay-output/` 是**已入库**的自写简答产物，属于「以账号主人名义提交自造内容」；公开前需人工确认是否保留。
- 代码里的账号标识一律从 `localStorage.userInfo2` 运行时读取，不含硬编码的姓名或学号。`.cdp/` 下部分历史探针仍硬编码课程/单元对象 ID（不是学号，但能反查到具体课程），清理归档时一并处理。
- 登录令牌不出现在源码、日志和本文档里。
- 本文档中的课程名、题号、时长数字均为公开课件内容或已去除身份指向的实测值。

**已清理的本地未跟踪产物**（2026-11-19，只影响本机，不在仓库历史里）：`.cdp/logs/privacy-expressions.txt`、`.cdp/logs/publish2/`（含独立 `.git` 的嵌套 clone）、`.cdp/logs/pre-rewrite-*.bundle`（旧历史备份）、`%TEMP%\kg-prefs-*` 测试残留。

**待人工确认的清理项**（涉及改写已跟踪文件，未自动执行）：`design-output/0d0456f4…/说明.md` 里的本机 JDK 路径 `D:\develop\Java\jdk-21`。`design-output/_draw/*.py` 已复查，不含本机路径。
