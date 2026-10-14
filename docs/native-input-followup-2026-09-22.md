# 原生输入后续核查（2026-09-22）

## IN-01：首次额外格式符观察的有界追查

最终结论：按 IN-01 原验收范围“确定原因或记录有界复现结论”，本项以**有界复现结论**收口。当前原生 ABC 三次完整/分批输入均无额外闭合符，保存、既有历史边界内的撤销/重做及关闭重开精确一致；首次历史异常原因仍未查明，本轮没有宣称修复该历史异常或保证永不复发。

本节基线 `57249f6`，开始时工作区干净。主任务独占原生 UI；本 agent 只读已有原生记录、检查现有入口并补组件 DOM observer 反例搜索，没有操作原生或浏览器，没有改产品、构建或提交。本记录不替代[已完成的真实中文输入闭环](native-input-acceptance-2026-09-22.md)。

旧 Trace 摘要 `/tmp/deditor-native-pair-trace/trace-analysis.json` 仍为 1,457 条事件、99 次单字符 `handleTextInput`，没有多字符输入或 composition，四段最终源码均只有正确的一对 `**`。这不是异常当次记录；不能将它解释为首次额外两个星号已定位或彻底消失。已证明并修复的 DOM 合并输入问题与原生首次观察的关系仍保持未定，见[原修复证据](urgent-format-pairs-2026-09-22.md)。

现有 `inputAssist.ts` 合并入口只重放与文档、选区、最终差异严格一致的已观察 `beforeinput: insertText` 序列；发生组合输入、粘贴、拖放或指针事件时清理。未知多字符文本和 composition 保留原有字面处理。256 个事件超限整批回退，不重放末尾部分、不截断正文。本轮没有根据字符串内容猜测闭合意图，也没有过滤合法输入。

新增两组正式专项（`scripts/test-markdown-format-pairs.mjs`，总用例数由 17 增到 19）：

- **七种格式闭合矩阵**：`**`、`__`、反引号、`$`、`~~`、`==`、`^`，通过真实 Visual 组件的 DOM 修改及 MutationObserver 交付，精确核对源文、生成配对清理和格式外续写。多字符批次由 ProseMirror 自行从 DOM 计算，不直接伪造其合并回调。
- **选区替换与交付边界**：生成 `**word**` 后显式选中正文，分别以一批 `next` / `*` / `*`、两批 `next` / `*` 然后 `*`、两批 `next` 然后 `*` / `*` 替换；三种结果均为 `**next**`，保存、撤销精确回到 `**word**`、重做及重挂载精确保真。临时测试最初错误期待撤销到更早的空段，已按显式选区的独立历史边界纠正；没有为此修改产品。

补测入口：

```sh
DEDITOR_TEST_FILTER='coalesced marker matrix|coalesced selected body' node scripts/test-markdown-format-pairs.mjs
```

本轮两组共 10 个变体通过，未重跑原有 17 组、全套或重性能。临时探索与正式执行日志在 Git 忽略目录 `tests/artifacts/native-input-followup-2026-09-22/`。这里只证明新增组件边界没有得到反例，不计为新原生验收。

### 原生下一步的最小观察

主任务如重演，在确认输入来源和焦点后的干净段落中，分别输入完整 ` **native**` 和分两次 ` **native` / `** outside`，立刻读精确源码并保存；成功只记录本次结果，不声称解释首次异常。已保存内容正确但 AX 展示星号不单独判故障，要同时看源码、生成配对及 projection 状态。

若后续再次出现额外星号，优先保留失败当次源码、DOM 选区、`beforeinput` data/inputType/isComposing、`handleTextInput` text/from/to、配对状态与事务前后记录；只在隔离快照加有界观察日志，避免修改产品输入逻辑或全量同步打印改变时序。若异常当次为多字符差异，检查前置事件能否完整匹配；若全部为单字，则检查生成配对何时清除、是否在焦点或选区变化时关闭投影。这是复发时的追查方法，首次历史异常的具体原因仍未定。

### 本轮三次实际原生复测

主任务使用当前原生诊断包、ABC 输入来源及自建 `pairs.md`。初始三段分别为 `First paragraph.`、`Second paragraph.`、`Third paragraph.`：

1. First 段尾通过 `typeText(' **native** outside')` 整批输入并 Cmd+S。
2. Second 段尾分两次 `typeText(' **native')` 和 `typeText('** outside')` 输入并 Cmd+S。
3. Third 段尾再次整批输入相同内容并 Cmd+S。

每次均未出现多余闭合符。第三次 Cmd+Z 只撤掉格式外的 ` outside`，符合既有格式历史边界，不将其表述为“整批输入一次撤销”。Redo 并保存后关闭文档，再 Cmd+Shift+T 重开，内容与 `pairs.saved.md` 精确一致。

独立最终读盘：`pairs.md` 严格等于 `pairs.baseline.md` 中三处 `paragraph.` 后分别插入 ` **native** outside`，也与 `pairs.saved.md` 全字节相同，SHA-256 均为 `d9e23efa49ecec2ece022e95b5af01c13eb5b4955c3fbbb174d9894cfd8292ec`。样例均在 `tests/artifacts/native-input-followup-2026-09-22/`，未使用用户文档。

主任务最终整合的完整配对专项也已通过 19 组，日志为该目录 `format-pairs-final.log`；与本 agent 先前只跑新增两组的范围分别记录。

实际观察日志为 `tests/artifacts/native-composition-diagnostic-2026-09-22/events.json`：共 600 条，`stopped=true`；其中 `pairs.md` 相关 350 条。第一轮完整文本的 capture 事件显示逐字符 `beforeinput/input inputType=insertText`、`composing=false`，星号对应 `code=NumpadMultiply`，不是 composition。第二轮仅前缀 ` **nati` 到达第 600 条后停止；第二轮后续与第三轮没有完整事件追踪，只按真实操作及最终磁盘证据验收。不根据第一轮的成功事件推断首次历史异常的失败机制，也不将有界日志当作所有原生输入的完整记录。
