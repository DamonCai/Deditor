# Markdown 连续操作验收清单（2026-09-12）

由[漏检复盘](markdown-operation-audit-gaps-2026-09-12.md)补充原有 64 组操作目录。这里的每一项都是用户可实际产生的操作链，不把当前实现的无响应直接写成预期。范围为阅读编辑及其直接关联的历史和模式切换；仅使用自建文档，不操作用户正在使用的原生窗口。

## 共同验收标准

先写下操作意图，按鼠标/键盘生成中间状态，再核对：文字和未修改区域、光标与后续输入、层级、点击前后/失焦后的外观、滚动、保存与撤销重做。不能在最后一步重新设置选区来掩盖焦点错误。模型回归、真实浏览器、原生、真实 IME 各自登记；存储接口模拟或重新解析不称为原生保存重开。

重点变体：文首/文末、块首/块尾、真正空与看似空（软换行/空格/空标记）、首项/末项、相邻格式/相邻特殊块、正反选区、快速重复/停顿后、撤销后直接续写。正常单步不替代这些组合。

最终结果见[第三轮整合记录](markdown-operation-round3-2026-09-12.md)：新增14类修复、40组专项，最终固定副本完整回归和构建通过。下表状态按专项证据理解；链接悬浮入口、最终原生包及平台边界仍单独列出，不能据此称全组合通过。

## 本轮并行范围

| 编号 | 实际操作链与预期 | 负责与状态 |
| --- | --- | --- |
| IN01 | 输入粗体→删光内部文字→离开→普通续写；无隐藏格式残留或困住光标 | [行内专项](markdown-sequence-inline-2026-09-12.md)，见逐键结果 |
| IN02 | 创建行内代码→删空→退出→输入；不吞字、不跳其他块 | [行内专项](markdown-sequence-inline-2026-09-12.md)，见逐键结果 |
| IN03 | 首段/末段格式首尾 Backspace、Delete→续写；只修改目标 | [行内专项](markdown-sequence-inline-2026-09-12.md)，见逐键结果 |
| IN04 | 相邻粗体/斜体/代码间左右移动→两方向删除→续写 | [行内专项](markdown-sequence-inline-2026-09-12.md)，见逐键结果 |
| IN05 | 跨格式选中替换→撤销→直接输入；原选区与后续输入正确 | [行内专项](markdown-sequence-inline-2026-09-12.md)，见逐键结果 |
| IN06 | 展开行内源码→修改/删掉部分符号→Esc→重新进入 | [行内专项](markdown-sequence-inline-2026-09-12.md)，见逐键结果 |
| IN07 | 选中文本→链接弹窗→Esc→直接续写；恢复正文焦点和选区 | [行内专项](markdown-sequence-inline-2026-09-12.md)，见逐键结果 |
| IN08 | 链接弹窗确认→续写→撤销/重做；链接与后续输入各自正确 | [行内专项](markdown-sequence-inline-2026-09-12.md)，见逐键结果 |
| TB01 | 新建表格→单元格输入→软换行→删光→输入；空外观仍可编辑 | [表格专项](markdown-sequence-table-2026-09-12.md)，模型/浏览器通过 |
| TB02 | 空格/软换行单元格→Tab/Shift Tab→返回输入 | [表格专项](markdown-sequence-table-2026-09-12.md)，模型/浏览器通过 |
| TB03 | 末格 Tab 增行→撤销→重做→直接输入；落点、行数正确 | [表格专项](markdown-sequence-table-2026-09-12.md)，模型/浏览器通过 |
| TB04 | 连续 Tab 与反向 Tab→首末格；不丢焦点、不异常增行 | [表格专项](markdown-sequence-table-2026-09-12.md)，模型/浏览器通过 |
| TB05 | 多格粘贴→清空→再输入；表结构和空白保真 | [表格专项](markdown-sequence-table-2026-09-12.md)，模型/浏览器通过 |
| TB06 | 多格粘贴扩表→撤销→重做；一次操作整体恢复 | [表格专项](markdown-sequence-table-2026-09-12.md)，模型/浏览器通过 |
| TB07 | 文首表格/前方空段→方向键离开→段落输入→返回 | [表格专项](markdown-sequence-table-2026-09-12.md)，模型/浏览器通过 |
| TB08 | 文末表格/后方空段→方向键离开→输入→撤销 | [表格专项](markdown-sequence-table-2026-09-12.md)，模型/浏览器通过 |
| BL01 | 插入 HTML 保留块→清空→Esc→直接输入；退出后焦点可继续 | [特殊块专项](markdown-sequence-block-2026-09-12.md)，模型/浏览器通过 |
| BL02 | 保留块点击前→编辑→点击邻段→再次进入；外观/原文一致 | [特殊块专项](markdown-sequence-block-2026-09-12.md)，模型/浏览器通过 |
| BL03 | 保留块修改→撤销→重做→直接按键；没有隐藏编辑器吞键 | [特殊块专项](markdown-sequence-block-2026-09-12.md)，模型/浏览器通过 |
| BL04 | 相邻特殊块/图片/空段之间离开与进入；不产生非法文本位置 | [特殊块专项](markdown-sequence-block-2026-09-12.md)，模型/浏览器通过 |
| BL05 | 插入图片→删除→撤销→直接续写；选中和焦点正确 | [特殊块专项](markdown-sequence-block-2026-09-12.md)，模型/浏览器通过 |
| BL06 | 图片替代文字/标题清空→失焦→重进；属性不复活 | [特殊块专项](markdown-sequence-block-2026-09-12.md)，模型/浏览器通过 |
| BL07 | 公式内容清空→退出→输入→撤销；邻文保留 | [特殊块专项](markdown-sequence-block-2026-09-12.md)，模型/浏览器通过 |
| BL08 | 长页保留块点击→编辑→失焦；无额外视口跳动 | [特殊块专项](markdown-sequence-block-2026-09-12.md)，模型/浏览器通过 |
| SH01 | 正文查找→替换为空→关闭→直接续写→撤销 | [会话专项](markdown-sequence-session-2026-09-12.md)，模型/浏览器通过 |
| SH02 | 代码中的查询→替换→关闭→进入代码续写→撤销 | [会话专项](markdown-sequence-session-2026-09-12.md)，模型/浏览器通过 |
| SH03 | 表格中的查询→替换→关闭→续写；不跳邻格 | [会话专项](markdown-sequence-session-2026-09-12.md)，模型/浏览器通过 |
| SH04 | 替换全部→撤销→重做→关闭→续写；保存及邻文保真 | [会话专项](markdown-sequence-session-2026-09-12.md)，模型/浏览器通过 |
| SH05 | 阅读编辑修改→源码→阅读→撤销→直接续写；焦点和历史正确 | [会话专项](markdown-sequence-session-2026-09-12.md)，模型/浏览器通过 |
| SH06 | 文档 A 编辑→B 编辑→A 撤销→继续输入；B 不受影响 | [会话专项](markdown-sequence-session-2026-09-12.md)，模型/浏览器通过 |
| TK01 | 任务软换行→删掉可见字→Backspace/Enter；可退出且保留子项 | [“bug修改”专项已完成](markdown-task-interaction-fix-2026-09-12.md)，独立原生包边界见记录 |
| TK02 | 首任务连续 Tab→两次 Shift Tab；整条缩进并逐级退回 | [“bug修改”专项已完成](markdown-task-interaction-fix-2026-09-12.md)，独立原生包边界见记录 |
| TK03 | 第二任务携子项→缩进→继续缩进→退出；层级与勾选保存 | [“bug修改”专项已完成](markdown-task-interaction-fix-2026-09-12.md)，独立原生包边界见记录 |
| TK04 | 多任务选择→缩进→退回→勾选→撤销；仅修改选中项 | [“bug修改”专项已完成](markdown-task-interaction-fix-2026-09-12.md)，独立原生包边界见记录 |
| TK05 | 已完成任务缩进→Enter→输入→撤销；新项未完成且层级正确 | [“bug修改”专项已完成](markdown-task-interaction-fix-2026-09-12.md)，独立原生包边界见记录 |
| TK06 | 代码点击→输入→失焦；高亮、字体、行号、布局保持一致 | [代码外观专项已修复](markdown-code-focus-fix-2026-09-12.md)，最终回归已覆盖 |

以上共 36 条检查点，30 条由本轮四人处理，6 条引用并行任务。它们是本轮锁定范围，不代表全部基本操作或所有组合已验收。每项最终状态要附实际证据；修复按根因去重，不按断言数量计数。

## English

This round assigns 30 user-generated action sequences to four agents and tracks six related cases handled by the concurrent task. Acceptance includes the next action after undo, cancellation, emptying, focus changes, and mode transitions. Model, browser, native, and IME evidence are kept separate; counts are not a claim of exhaustive usability coverage.
