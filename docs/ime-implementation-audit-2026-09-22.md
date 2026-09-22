# 阅读组合输入与 XMind 候选定位审查

2026-09-22，普通包基线 `57249f6`。只审查自建样例，不访问用户正文；审查 agent 不操作系统输入源或剪贴板，原生 UI 由主 agent 控制。主端测试中切换 ABC/拼音，结束已恢复初始简体拼音。组件 composition 事件不能替代系统候选窗口验收。

## 已读实现

- `compositionViewport.ts` 使用 DOM caret 几何而非可能滞后的 ProseMirror 位置，collapsed range 无矩形时读取相邻字符/空段；wheel/touchmove/pointerdown 释放原锚点，compositionend 后两帧收尾。已有 IME 几何专项覆盖用户滚动优先、超出视口最小滚动及销毁。
- `markdownComposition.ts` 汇总候选替换为同一历史编辑，最终输入后结算；阅读同步避免在 view/session 仍组合时重建文档。此规则本身不能证明原生输入事件的字符/修饰顺序正确。
- XMind 标题是可见 `foreignObject` 内的原生 textarea，编辑框随可视区域和缩放调整，没有把候选输入定位到远处的隐藏控件。Enter/Escape 的 composition/isComposing/229 排除已经存在；候选弹窗最终位置由 WK/系统输入法处理，必须实际观察。

首轮没有确定产品缺陷，因此没有凭“尚未验收”修改这些实现，也没有改配对路径。按主端要求优先诊断实际光标移动/保存序列，未扩大运行模拟测试。

## 自建原生操作矩阵

| 项目 | 自建动作 | 核对重点 |
| --- | --- | --- |
| IN-03 | `Cursor target: LEFT|RIGHT` 中间用真实拼音开始组词，分别左/右移动再提交；普通 WK textarea 执行同链 | 每个 key/composition/beforeinput/input 的实际顺序、预编辑文字拆分、最终插入位置；不能把平台默认行为先判为产品问题 |
| IN-04 | `Scroll target: START|END` 开始组词后真实滚轮移动文档，再提交/取消 | DOM selection 未改到其他文本，scroller移动是否由用户请求、是否被拉回；候选视觉位置另截图 |
| IN-05 | 组词期间真实 Cmd+S，再通过普通 WK textarea 比对同键序列 | 字母 s 何时进入 DOM，是否早于带 meta 的 keydown；最终磁盘与已提交/预编辑状态分别记录，不过滤合法 s |
| IN-06 | XMind 自建主题实际组词，宽/窄窗口或适当缩放观察候选 | 输入框与候选的实际相对位置；不以 textarea DOM rect 或提交成功代替候选截图 |

## 独立诊断入口

`prepare-native-composition-diagnostic.mjs` 复制已有 dist，注入 `tests/diagnostics/native-composition.ts`，生成独立 `DEditor Composition Diagnostic` / `com.deditor.compositiondiagnostic20260922`。不改 src/dist/Vite；普通产品没有导入该模块。输出目录必须是新的，避免覆盖证据。

```sh
node scripts/prepare-native-composition-diagnostic.mjs
npm run tauri -- build --debug --bundles app --config tests/artifacts/native-composition-diagnostic-2026-09-22/tauri.compositiondiagnostic.json
```

只在标题栏当前文件路径属于本仓库 `tests/artifacts/` 时记录编辑面事件。默认自建文件 `tests/artifacts/native-input-followup-2026-09-22/composition.md`。包括 keydown/up、composition start/update/end、beforeinput/input/textInput、pointerdown、滚轮/滚动、selectionchange、DOM mutation。保存 key/code/keyCode、修饰键、isComposing、isTrusted、inputType/data、DOM文本及选区节点路径/offset、编辑框与父滚动容器位置。

600条自动停止，每条文本最多12000字符；截断字段明确记录，不是产品大小限制。二进制文件写入只针对自己的 `events.json`，避免生成编辑器历史。观察器不 dispatch、不 preventDefault、不更改输入或焦点。capture-microtask 被明确标为 capture 回调后，不保证晚于 React 冒泡；animation-frame 和 DOM mutation 供状态对照。ProseMirror 没有稳定公开实例句柄，因此明确标为未观测，不用私有 DOM 属性冒充公开模型快照。

诊断会读布局，只用于有界事件归因，不能作为性能数据或最终普通包验收。


## 首次原生诊断观察（不计 IME 通过）

观察到两次 n/i 输入及滚轮序列（提取seq1–166，`events-direct-input-attempts.json`）。seq125/137为trusted keydown但isComposing=false，129/141为insertText，完全没有compositionstart/update/end。149/151滚动将scrollTop0→800，ProseMirror DOM selection仍为节点路径[2,0]、offset22。Space同样是普通insertText，DOM得到`STARTni |END`；随后scrollTop800→148使普通输入后的caret可见，offset23。系统输入源设置为拼音与实际WebView收到组合事件是不同证据，不能按这段记录声称IN-04通过或IME产品缺陷。

诊断中个别已排队的animation-frame记录可能来自仍挂载但隐藏的源码surface，不能把不同surface文本作前后比较。只读摘要脚本 `read-native-composition-diagnostic.mjs` 以每条capture事件的surface class/selection构建时间线；本轮归因使用相同ProseMirror surface，不将隐藏源码旧值解释为文档回退。


## 有效原生组合与滚动观察

重启诊断会话后，seq2为compositionstart，6/20为insertCompositionText(n/ni)，13/26的keydown.isComposing=true，确认此轮确为系统组合输入。seq32/34真实wheel/scroll使scrollTop0→800，DOM selection仍为[2,0] offset22；用户滚动释放原锚点，没有把编辑位置迁到屏幕中新出现段落。

seq37–49按deleteCompositionText→insertFromComposition(`你`)→compositionend完成提交，原插入位置offset20最终成为21，正文为`START你|END`。滚动800保持至提交；seq42 textInput前回到148使提交caret可见，不能将其误读为组合期间不允许用户滚动：wheel后viewport锚定已释放，提交沿用原生/编辑器正常caret可见策略。

seq62 Cmd+S的meta=true、isComposing=false且没有字母s的文本input。主端独立AX确认后保存，磁盘仅有`START|END`→`START你|END`变化，并归档 `scroll-chinese.saved.md`。这是**组合期间滚动及提交后保存**的有效证据，不替代IN-05的活动组合期间保存，也不代表候选窗口视觉位置已通过。有效前79条（含开始撤销动作）归档为 `events-composition-scroll-confirm.json`；后续撤销重做和最终关闭状态由主端补齐。

## 光标移动、取消与活动组合保存

完整221条归档 `events-cursor-and-active-save.json`，以下只比较同一 ProseMirror surface：

- **光标/preedit范围**：seq100开始在`LEFT|RIGHT`的offset19组词，n/ni均为insertCompositionText。seq138 ArrowLeft的isComposing=true；seq140系统compositionupdate的数据直接为`n i`，142/144按该预编辑内容更新到`LEFTn i|RIGHT`。ArrowRight同样在组合期间，没有修改外侧LEFT/RIGHT。此处空格来自平台候选预编辑数据，不是编辑器额外插入的Markdown字符。
- **取消与保存**：seq156–161 deleteCompositionText→compositionend空字符串，正文精确恢复`LEFT|RIGHT`，选区offset19；172的Cmd+S已是meta=true/isComposing=false。独立读取磁盘 `composition.md`，与已保存的 `scroll-chinese.saved.md` 完全一致，滚动用例提交的“你”保留，光标取消用例没有残留。
- **活动组合保存仍未通过**：seq178重新组合，208先收到compositionupdate(`ni s`)，210为beforeinput insertCompositionText，212的input已使DOM成为`LEFTni s|RIGHT`；216才收到meta=true/isComposing=true的keydown `s`，晚于文本input约6ms。主端看到dirty。这个序列与此前普通WK textarea的“s先于带Command的keydown进入预编辑”同型，不能通过在编辑器keydown中删除合法s来掩盖上游事件顺序。

主端报告光标移动的预编辑范围行为与普通WK textarea对照一致；本子任务独立核对的是DEditor事件与磁盘，未自行操作控制组UI。IN-03本轮确认文字范围/取消恢复，IN-04确认实际组合滚动与提交位置；候选窗口视觉位置仍无截图证据，IN-05仍需可信的活动组合原生按键链，IN-06不能靠DOM输入框几何判为候选定位通过。本轮未发现可定因产品缺陷，未改产品源码、配对逻辑或pending/completed；所有新增内容仅用于诊断及独立证据记录。


## 主端最终闭环与清理

滚动提交后单次 Cmd+Z / Cmd+S 与2524字节baseline完全一致；Cmd+Shift+Z / Cmd+S后关闭并重开，与`scroll-chinese.saved.md`逐字节一致（2527字节，唯一新增“你”）。活动组合保存核查结束以Escape取消，最终`composition.md`仍精确等于该中文副本。普通对照页仅修改临时textarea值，HTML源文件未改。所有自建文档已关闭，普通与组合诊断测试包均退出，系统输入源读取确认为SCIM.ITABC；日常应用未替换。
