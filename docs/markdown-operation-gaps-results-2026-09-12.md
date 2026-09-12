# 阅读编辑操作缺口并行检查结果（2026-09-12）

用户在盘点之后授权多个 agent 一起检查。本批由三个 agent 与主 agent 分工执行：边界/空内容、整块/跨块及剪贴板/表格拖动、真实鼠标/目录/布局、保存错误恢复与整合验证。待查项目不等于已有 bug；本批确认并修复 **7 类独立根因**，不重复计算此前文末代码块修复，也不把初步修复被测试拦截的问题另计数量。

## 修复清单

| 编号 | 实际问题 | 修复后的操作结果 |
| --- | --- | --- |
| G01 | 整块/选区删除后输入与删除合并撤销 | 第一次撤销续写，第二次恢复删除的块和选择范围 |
| G02 | 普通列表/引用的硬换行空占位不能退出 | Enter/Backspace可退出纯硬换行占位；文字、空格、图片与真正空项维持各自行为 |
| G03 | HTML/details/YAML保留块剪切粘回变成代码块 | 带保留标记的剪贴板HTML优先恢复为保留块，普通pre仍是代码 |
| G04 | 快速拖表格行/列，立即松手落在之前经过的位置 | 按最终drop坐标同步确定位置；真实行/列到末尾和一次撤销通过 |
| G05 | 点击目录轨道误触展开后的首标题，或固定目录丢选区 | 展开点击不误导航，固定/取消固定保留编辑目标，明确点击和键盘导航有效 |
| G06 | 手动保存/另存为/关闭时保存失败没有清楚反馈 | 显示失败文件与原因、保留未保存文档，继续编辑后能重试 |
| G07 | 关闭弹窗后内嵌代码已收起，原输入无法聚焦 | 焦点交回外层编辑器，由其恢复内嵌代码选区，关闭后直接续写有效 |

G01/G02见[边界检查](markdown-boundary-audit-2026-09-12.md)，G03/G04见[选择与拖放检查](markdown-selection-audit-2026-09-12.md)，G05见[鼠标检查](markdown-mouse-audit-2026-09-12.md)，G06/G07见[错误恢复检查](markdown-recovery-audit-2026-09-12.md)。

## 检查范围与不能合并的证据

- 边界/结构：12组专项，涵盖唯一块、文首文末、清空续写、嵌套退出与非空反例。具体哪些有真实浏览器，哪些仅组件证据，见逐项表。
- 选择/剪贴板/表格：7组专项；真实图片/公式删除续写、保留块剪切粘回及跨文档、跨块拖选、行列快速拖动等另列。
- 鼠标：8个检查点，6组目录事件回归。双击/三击、正反拖选、Shift点击、折行、宽度变化、目录入口有真实证据；一次边缘拖动不代表持续跨多屏通过。
- 错误恢复：8组专项，另回归已有8组保存竞争；真实浏览器正文/代码中关闭错误后续写、撤销、重试及关闭保存失败。磁盘错误由隔离替身注入。
- 新增统一入口 `npm run test:markdown-operation-gaps` 共33组专项，已接入 `test:markdown-operations` 和 `test:all`。公共焦点恢复另外新增1组通用回归。以上是测试组数，不是33个修复。

## 合并前拦截

1. 初步空占位修复改变了普通零内容空列表的撤销规则。旧混合列表18组合拦截后，收窄扩展范围，原断言重新通过。
2. 交叉审查发现仅看textContent会把含图片的任务误判为空；实际Schema核对后补非文本反例与Enter限定。图片任务未被误退出。
3. 表格修复增加外部/异表落点、拖动期间正文变化、索引范围及取消清理保护。核对上游发现表头移动原本有效，保留该能力并验证Schema及撤销，未按推测禁用。
4. 原生包构建和测试在目录外最初用了系统Node16，导致Vite缺少crypto接口；显式使用项目Node23.11.1后继续。不是产品bug。
5. 首次目录复制时夹入了并行图表模式的部分代码，特殊块专项拦截了入口与实现不匹配。最终副本明确从bce1e9f恢复代码显示、CSS和对应专项，再完整重跑；没有撤回原工作区的并行改动。
6. 验证副本将测试编译缓存独立，避免并行任务改写同名缓存。开发服务热更新引起的中途重挂载不算产品失败，也不算通过。

## 固定版本与整合验收

最终副本：`/var/folders/ls/ffs5872n5pz2yk47_m92ylvc0000gn/T/deditor-operation-gaps-verified-5ysjg4gu`，有逐文件SHA-256清单 `verification-manifest.json`。

基线为 `bce1e9f` 加本批修复。副本沿用冻结时的代码块显示、共享CSS及特殊块测试；后来另一任务新增图表模式的 `codeView.ts`、CSS、文案和测试入口未混入此副本。原工作区这些并行改动完整保留。因此本记录不能代表当前并行开发的所有代码整体通过。

最终范围明确的副本已完成完整 `npm run test:all`，退出码0：62核心、107阅读集成、145通用、119 XMind、33本轮专项及统一入口其他各项通过。生产构建（12.47秒）与macOS隔离应用构建（1分29秒）通过。用户要求暂停后做收尾时，原运行已自然完成；没有为交接另起测试。早先副本的混合列表/图表入口失败不能与这份最终日志混用。

原生验收尚未完整完成，不能把构建通过计为交互通过，详情见下方暂停接续。

## 仍需独立验收

- 真实链接纯悬浮入口。
- 按住鼠标在边缘持续跨多屏拖选、表格拖动中途真实Esc取消和慢速操作的完整组合。
- 不同系统应用来源的剪贴板、真实原生跨应用往返。
- 系统缩放与图片/公式/图表异步高度变化时的全部编辑组合。
- 更多复杂非文本嵌套转换、长期连续编辑、真实IME、Windows及图床账号。

这些保留为待验证，不把有限专项通过写成八类全组合验收完成。本任务没有执行提交推送；收尾发现外部操作已将本批代码及早期文档纳入 `ccd6a14`，所以不能再笼统说所有改动仍未提交。最新接续文档修改仍留在工作区。

## English summary

Three agents and the parent checked operation gaps and fixed seven distinct causes: selection-deletion history grouping, hard-break-only list/quote exits, preserved-block clipboard parsing, stale table drag destinations, outline click/focus interference, invisible manual-save errors, and focus recovery for collapsed embedded code editors. The targeted entry contains 33 groups; browser, component, injected IO and native evidence are tracked separately. Initial regressions were caught without weakening the existing mixed-list assertions. A fixed snapshot excludes concurrent diagram-mode development. Remaining native/platform, sustained-drag, hover and long-running combinations must not be marked passed by inference.

## 用户要求暂停后的接续（2026-09-12）

**暂停原因：用户明确要求“更新上下文，留着下次在做”。整体操作验收未完成，本次仅整理记录和清理，不继续扩大修复范围。**

### 原生已经做过什么

- 只用 `/tmp/deditor-operation-gaps-native-mnvdvafg/` 中的自建文件。隔离应用标识 `com.deditor.operationgaps.mnvdvafg`，应用名 `DEditor Operations Review`。
- 较早、尚未排除并行图表部分代码的包：代码整块删除→逐键abc→撤销，第一步只撤销续写，第二步恢复代码，保存原文逐字节核对通过。这不是最终范围明确副本的完整原生结论。
- 同一较早包：自建review.md临时设为只读，原生“文件→保存”实际得到 Permission denied (os error 13)，错误弹窗包含文件名和原因；Esc后在代码中**粘贴**AfterError可直接续写。恢复写权限后保存为 `nativeCodeAfterError`，关闭重开与磁盘一致。文件权限已恢复0644。该结果证明真实失败反馈/粘贴续写/重试闭环，不能改写成真实IME或逐字输入全部通过。

### 下次优先处理的未明异常

最终范围明确的包已经构建并启动；代码整块删除后快速调用实际按键a/b/c、Cmd+Z、Cmd+S，界面出现字面的z/s，没有可靠执行预期撤销和保存。早期画面还有带下划线的未确认文本；较早原生代码输入也出现过类似q/s异常。**原因未确定，不能直接归因输入法、自动化工具或产品，也不能计为已修复的新bug。**

暂停清理时新读到的正文为 `Recovery baselineabczs`；通过实际“文件→保存”将现场保存到自建review.md，磁盘精确为 `Recovery baselineabczs\n\n\n`，随后关闭review.md/raw.md并从应用菜单退出；PID60125已不存在。只剩应用自动生成的欢迎页状态，无测试文件待恢复。未动用户文档。

下次首先固定最新代码与测试缓存，核对真实输入源/组词状态及按键事件，分开比较逐键输入后的菜单撤销/保存与快捷键撤销/保存；同时记录源文本、焦点、composition与修饰键事件。不要用一次粘贴替代逐键，不要把当前有限原生通过覆盖最终包未验证项。之后补最终包的保存/撤销/重开及原生剪贴板，再按“仍需独立验收”清单推进；用户没有要求现在继续。

### 接续入口、现场及并行保护

1. 先读本文件及[未覆盖类型盘点](markdown-unchecked-operation-types-2026-09-12.md)，再读四份专项记录；本批按独立根因计7类，不与既有47类直接相加，避免跨任务重复。
2. 检查Git。本任务期间外部提交由bce1e9f到ccd6a14，已包含本批修复。图表三模式、样式和测试仍由独立任务更新；保护 `codeView.ts`、`markdown-visual.css`、`diagramSplit.ts`、共享i18n/package及AGENTS中的并行记录。旧固定副本仅证明上述范围，不能代表最新工作区整体。
3. 验证副本路径见上；目录外运行需使用 `/Users/damon/.nvm/versions/node/v23.11.1/bin` 的Node，避免落回系统Node16。副本的测试缓存独立，不能重新共享同名esbuild缓存导致并行污染。完整回归入口为 `npm run test:all`，本批入口为 `npm run test:markdown-operation-gaps`。
4. 日志、1036项文件哈希清单、原生基线、成功恢复文件与暂停时review.md已归档到 `tests/artifacts/operation-gaps-handoff-2026-09-12/`，状态见run-status.json。该目录被Git忽略，跨机器须单独迁移；临时副本与应用也不随Git同步。原生应用包在 `/tmp/deditor-operation-gaps-native-mnvdvafg/DEditor Operations Review.app`。同名共享构建目录可能被其他任务更新，不要据名字认定版本。
5. 三个agent均结束，已清理各自浏览器标签/服务。主agent的浏览器恢复测试标签/5186服务已关闭；原生测试应用已退出，最终完整测试进程也已结束。不停止其他任务的开发服务。

### Pause handoff (English)

The user explicitly requested a pause. Seven fixes are recorded. The scoped final snapshot completed test:all with exit code 0 (62 core, 107 visual integration, 145 general, 119 XMind, and 33 new targeted groups), plus frontend and native builds. Earlier native evidence covers real permission-denied recovery and paste-based continuation, but final native acceptance is incomplete: rapid typing followed by Cmd+Z/Cmd+S inserted literal z/s. The cause is unresolved. The generated document was saved through the native menu, archived, closed, and the isolated application exited. External commit ccd6a14 captured this task's earlier changes; this task did not commit or push. Preserve concurrent diagram work and transfer ignored artifacts separately if changing machines.
