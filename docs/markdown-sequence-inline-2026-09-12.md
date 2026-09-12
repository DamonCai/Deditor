# 第三轮行内格式连续操作（2026-09-12）

先按用户意图锁定 8 条链，以下预期写于复现前。仅使用自建正文；模型/组件验证与真实鼠标键盘证据分开，不沿用“上游没反应就是通过”。

| 编号 | 用户生成链 | 用户预期 |
| --- | --- | --- |
| IN01 | 正文中打开粗体→输入字词→选中并删光字词→向右退出→续写 | 删除的内容不复活；能离开空格式，续写位于原段落、无粗体；尾段不变。 |
| IN02 | 正文中打开行内代码→输入字词→删光字词→向右退出→续写 | 空代码不困住光标；续写是普通正文，不丢前后文字；撤销可恢复删除前代码。 |
| IN03 | 输入一个位于段首的格式词→离开→回到其首边界 Backspace→续写 | 不越过本段误删上一块；删除行为与可见字符相符，继续输入在该边界。 |
| IN04 | 输入一个位于段尾的格式词→离开→回到其末边界 Delete→续写 | 不回跳到格式内部或其他块；不误吞前面的文字，续写位置明确。 |
| IN05 | 连续创建相邻粗体和代码→在中间向后删除→续写 | 只删除边界相邻的可见内容；不吞掉整个格式词或另一段；源码与可见内容一致。 |
| IN06 | 连续创建相邻粗体和代码→在中间向前删除→续写 | 同上，方向相反；撤销恢复完整两段格式，再输入不落到过期选区。 |
| IN07 | 创建格式词→选中替换→撤销→续写 | 撤销恢复被替换词与正确选区；续写仅影响恢复后的目标，不把标记当正文插到错误位置。 |
| IN08 | 创建链接→进入链接编辑弹窗→Esc / 确认→原位置续写 | Esc 保留原链接，确认只改变所填信息；弹窗关闭后原文有焦点，可直接续写，撤销一步可恢复链接修改。 |

尚未验证项目不能计为通过。当前浏览器工具返回空清单，建立 Chrome 标签报不可用；继续独立模型验证，真实浏览器链路待工具恢复或主任务接力。

## 实施与模型结果

新增 IN00：点格式按钮后**逐字**输入 `w`、`o`、`r`、`d`。用户预期四个字母都留在刚启用的格式中。该链由真实浏览器发现一次性插入整词会掩盖光标问题后补入，最终固定为 9 条连续链。

`scripts/test-markdown-round3-inline.mjs` 九条通过，具体结果：

| 链 | 结果 |
| --- | --- |
| IN00 | 粗体和代码逐字输入均保留完整 `word`，光标在闭合符之前。 |
| IN01/02 | 创建粗体/代码、删词、撤销恢复、重做删除、右移退出、续写得到 `Start NEXT end.`，没有空星号/反引号，尾段保留。 |
| IN03 | 段首粗体，移动到展开源码第一个符号前，再 Left 确认退出，Backspace、续写得到 `NEXT**word** after.`。 |
| IN04 | 文档末尾粗体，移动到闭合符后再 Right 退出，Delete、续写得到 `Before **word**NEXT`。该条使用文档末尾，不把“不删除后续段落”当作此用例的通过结论。 |
| IN05 | 用户分别创建相邻粗体/代码，在代码 `co` 后 Backspace 删除 `o`，续写 X 得到 `Before **bold**` 后紧接代码 `cXde`；保存快照一致。明确操作点是相邻代码开头内部，并非跨越分隔符删除整个格式。 |
| IN06 | 相邻粗体/代码，代码首字前 Delete 删除 `c`、Esc、Undo、续写 X，得到粗体 `bold` 紧接代码 `Xcode`，X 不再进入前侧粗体。 |
| IN07 | 给所选 word 加粗，替换 NEW，撤销仅恢复粗体 word，续写 X 只替换恢复的选区；不会同时撤掉加粗。 |
| IN08 | 创建链接，原光标在 label 内，调用与悬浮 Edit 按钮相同的入口；Esc / Enter 关闭，恢复原字符偏移，续写得到 laXbel。保存快照一致；撤销先移除续写，再独立撤销确认的 URL 修改。 |

源码投影展开会改变 ProseMirror 数字位置，所以 IN08 用标签内字符偏移与最终精确源码核对，没有把同一原文位置必须保持同一 PM 数字当作预期。

## 缺陷与修复

本专项记录 6 个独立可复现症状，其中“操作后历史边界遗漏”与其他 agent 的插入命令同源，**最终总统计只算一类**。粗体/代码、左右两侧变体不另计数。

1. **逐字输入只有首字有格式。** 旧 `**w**ord` / `` `w`ord ``；进入行内源码时按实际正文末尾放光标，保留闭合符。只修正文变更触发的进入，鼠标/方向键进入仍按原源码位置。
2. **删光格式文字留下可见空壳。** 旧 `Start ****NEXT end.` / ``Start ``NEXT end.``。仅对已经存在的有效格式，识别正文删除后只剩原分隔符的状态，在同一个删除事务里清空外壳；不扫描/改写原本的普通标记文本。
3. **明确移出格式仍继承内侧格式。** 旧 `**NEXTword**`。退出左右边界时采用相应外侧标记，保留空标记数组表达普通正文。
4. **相邻格式处撤销删除后续写进入前一格式。** 旧粗体 `boldX` 紧接代码 `code`。收起源码时按正文首尾选正确侧标记；没有视觉历史快照的恢复只保留新光标相邻文本中仍存在的显式标记，也保留明确的 `[]`。已有历史 selection JSON / NodeSelection 路径不变。
5. **格式命令与后续选中替换合并撤销。** `commands.wrap` 操作出口隔离历史，由 input_clipboard agent 协同修改；本专项保存失败/通过证据，不与其 `commands.insert` 同源问题重复统计。
6. **链接编辑关闭后整段 label 被选中。** 旧 Esc 后原 caret 变成 anchor 8 / head 13，接着输入会替换整个标签。新增 `linkSelection.ts` 包装编辑入口，关闭时恢复用户原 bookmark；正文文字/结构大小变化后不恢复过期位置，关闭后续写有独立历史边界。

产品文件：`inlineSource.ts`、`linkSelection.ts`；`MarkdownVisualEditor.tsx` 仅 helper 接线及无视觉历史快照的标记亲和性恢复。`commands.ts` 的协同改动由另一个 agent 负责。本路未改任务/列表/document/inputAssist/markdown/preview/codeView，也未改 package.json 或总清单。

## 证据与方法限制

- 模型/组件最终：`tests/artifacts/deditor-round3-inline-final.log`，9 链通过；其中普通字符输入/删除使用 ProseMirror 事务，未消费的左右方向键补模拟模型默认移动，**不能作为真实键盘默认行为证据**。
- 原格式/链接回归：`tests/artifacts/deditor-round3-existing-format.log`，10 组通过。
- 类型检查：`tests/artifacts/deditor-round3-inline-types.log`，通过；diff 检查通过。
- 失败前：`deditor-round3-inline-sequential-before.log`（首字格式）、`deditor-round3-inline-before.log` / `deditor-round3-inline-code-before.log`（空壳）、`deditor-round3-inline-real-exit-before.log`（确认已退出后的标记继承）、`deditor-round3-inline-other-before.log`（相邻格式撤销）、`deditor-round3-inline-replace-before.log`（撤销合组）、`deditor-round3-inline-link-before.log`（链接整词选区），均位于 tests/artifacts。
- 本轮已纠正一次模型检查：初版 IN03 的 navigate(1,1) 实际停在源码 offset 2，JSDOM 又不执行原生 ArrowLeft，所以当时未真正移出格式。该次失败不作缺陷证据；补齐移动并明确断言投影已关闭后，才重新取得有效失败。

真实浏览器由根 agent 接力：本子 agent 的 Chrome/IAB 不可用；根的 IAB 已实际按键确认 **IN00 首字格式、IN01 空粗体壳、IN03 退出后仍加粗** 的失败前状态。链接及相邻格式的真实失败前暂未计入；共享 HMR 曾重置长链，最终改为固定快照统一复测。根将在本节补充固定快照真实鼠标/键盘结果。

自建页面 `tests/markdown-round3-inline-review.html` 提供 empty / first / last / adjacent / replace / link 六种**无预制格式**正文，必须由用户操作创建中间状态。下方 Source 和 Save snapshot 可直接比对原文。测试不触及用户文档或当前原生应用。本子 agent 没有启动服务或留下标签。

## 固定快照逐键复测后的纠正与最终模型版本

根 agent 固定快照用真正逐键的 N/E/X/T 再次发现 IN03 未闭环：结果是 `N**EXTword**`，只有第一个字在外侧。此前模型 IN03–IN08 的 `input('NEXT')` 仍一次插入整段，确实再次掩盖了每字之间的自动投影变化；前面的“9 链通过”仅代表旧输入粒度，不能作为最终逐键链的通过证据。

本次将**整个专项**的 `input(text)` 改为逐字事务、每字处理后再输入下一字，不只测试入口单词。修复了普通输入后光标恰在下一个格式起点时的自动展开：此时保持外侧输入，不把下一字送到开符号之后。失败前模型精确重现 `N**EXTword**`，证据 `tests/artifacts/deditor-round3-inline-each-before.log`。

逐字模型同时发现原历史边界问题的两个遗漏入口：首字触发源码展开时会拆历史，而选词后的删除又可能与后续字合组，导致删除 word 后 Undo 只恢复 w。现在由输入触发的投影展开不另拆历史，真正的纯选区变化切断输入分组；相同选区、投影事务、`view.composing` 或尚未结束的 session composition 都排除。`MarkdownSession` 仅新增只读 composing getter，包含 compositionend 之后尚未结算的状态。该修复与前述操作历史边界问题统一归类，不另以变体增加总数。

最终模型证据已更新为：

- `tests/artifacts/deditor-round3-inline-every-character-after.log`：9 条**全程逐字**链通过；包含选词删除→Undo/Redo、方向键退出→逐字输入、选中替换→Undo→输入。
- `tests/artifacts/deditor-round3-inline-enter.log`：8 项既有回车历史回归通过。
- `tests/artifacts/deditor-round3-inline-ime.log`：11 项已有组词/IME 模拟与几何回归通过。它们不替代真实中文候选输入验证。
- `tests/artifacts/deditor-round3-inline-final-types.log`：类型检查通过。

本段取代前文旧 `deditor-round3-inline-final.log` 作为最终逐字模型结论。真实固定快照最终复测仍由根 agent 补充，不拿这些事务测试代替浏览器原生默认事件。

## 根 agent 最终固定版本 UI 接力

最终副本 `deditor-sequences-final-vrowvy5h` 以真实逐键复测：IN00–02创建粗体/代码、删空及撤销完整词；IN03 左侧 NEXT 全部保持普通正文并可整词撤销；IN04 明确走过全部闭合符后右侧 NEXT 普通续写；IN05 `co` 后 Backspace/X 为 `cXde`；IN06 Delete/Esc/Undo/X 为相邻代码 `Xcode`；IN07 选中替换、撤销恢复粗体 word 后 X 正确替换选区。原文与邻段均按页底源码核对。

IN08 真实工具栏先创建链接，光标 `la|bel`；为绕开工具没有悬浮动作的限制，用明确标记的样例按钮调用真实编辑 API 打开实际浮层，再用真实 Esc/Return/逐键输入/撤销。取消后 X 为 `laXbel`，确认新 URL 后 X 仍在原词内；两次撤销分别恢复原词和原 URL。**悬浮 Edit 按钮的可达性仍未验证**。该测试入口仅在fixture，不属于产品功能。

最终40组新增专项、完整回归和构建通过，详细操作/环境证据 `tests/artifacts/round3-root-browser.json`，参见[第三轮结果](markdown-operation-round3-2026-09-12.md)。根及子agent自建标签/服务均已清理。本节取代前面的“等待根复测”状态，保留各项明确边界。

清单补充入口也已在最终副本实际按键核对：创建 `**word**` 后删一个闭合符、Esc保留 `**word*`；该状态仍能续写，两次撤销恢复完整粗体词和邻文。工具栏选中label→Link→Esc→X只替换原选区，一次撤销恢复label。这两项没有新增产品修改。
