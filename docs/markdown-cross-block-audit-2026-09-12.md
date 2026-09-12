# 跨块删除与替换检查（2026-09-12）

起始 HEAD `34b8e35`、Git 工作区干净。范围固定为正文、标题、嵌套列表、引用与表格的跨块选区删除/替换，正反选区，以及撤销重做后继续输入。全为自建测试内容；没有操作用户文档，没有提交推送。并行修改由各任务保留。

## 两项独立修复

### 1. 正文跨入表格删除后，重做多出空行

自建原文：

```markdown
Before untouched

alpha middle

| H1 | H2 |
| --- | --- |
| beta tail | kept cell |

After untouched

[ref]: https://example.com/keep
```

真实拖选 `alpha middle` 偏移 6 → `beta tail` 偏移 5，Backspace 后得到 `alpha tail` 与残余单列表格。修复前，ProseMirror 内部留下空表头行；撤销/重做后 DOM 表格变成 4 行，和删除后结构不同。

根因：Milkdown 允许零个单元格的表头行。通用表格修复器遇空行默认补普通数据格，但表头 schema 只接受表头格，结构拟合又生成数据行。

修复在 `tableLists.ts` 单独扩展表头行约束为 `table_header+`，让边界拟合保留一个空表头格。没有将表头行送入单元格解析/序列化扩展。修后相同真实拖选、删除、撤销、重做稳定为 2 行，继续输入 Z 得到 `alpha Ztail`，未选中单元格和引用定义保留。

### 2. 非键盘 insertText 跨块替换把引用显示色写入源码

自建嵌套列表与引用，拖选列表 `alpha middle` 偏移 6 → 引用 `beta tail` 偏移 4。浏览器 CUA `typeText('NEW')` 实际触发事件日志：

```json
{"inputType":"insertText","data":"NEW","isComposing":false,"cancelable":true}
```

修复前余下 `tail` 被写成 `<span style="color:rgb(96, 107, 122)">tail</span>`，该色仅来自引用显示样式，原文没有颜色标记。普通真实单键 `pressKey('x')` 路径正常，故本问题精确限定为非键盘 `beforeinput insertText`；没有声称语音输入、真实 IME 或普通逐键输入都失败。

ProseMirror 已在跨块 keypress 路径用事务插入文本，但此 beforeinput 路径仍依赖浏览器 DOM 替换。新增 `crossBlockInput.ts` 对可取消、非组词、普通 insertText 且两端跨 textblock 的事件采用相同事务策略，并转给现有 handleTextInput 链；排除代码、raw、inline_source、同段输入。已经处理的 keypress 会 preventDefault，不产生第二次 beforeinput。

修后同一 CUA 文本输入与同一事件参数得到 `alpha NEW tail`，不再添加 span。CmdZ 精确恢复原始列表标记和引用；重做后真实单键 z 得到 `alpha NEWz tail`。

## 验证

- `scripts/test-markdown-cross-block-audit.mjs`：**39 组通过**。36 组合＝正文→标题、标题→列表、嵌套列表→引用、引用→列表、正文→表格、表格→正文 × 正反选区 × Backspace/Delete/beforeinput 替换。每组检查只删除所选文本、前后原文、撤销精确恢复、重做文档结构、继续输入、保存和重挂载结构。
- 另 3 组：表头格式/对齐在编辑保存历史重解析后保留；跨块替换保留后缀粗体；同块、组词事件与 raw 端点不被新处理器接管。
- `scripts/test-markdown-table-audit.mjs`：**11 组通过**，含跨格、增删行列、对齐、单元格换行/列表、TSV、保存历史和重挂载。
- 真实浏览器独立副本 `/tmp/deditor-cross-block-tB4Jfr`、端口 5198：表格修复前后相同坐标拖选链；列表→标题反向拖选 Delete/撤销/重做/继续输入；嵌套列表→引用拖选文本替换前后事件与源码对照。测试页 `tests/markdown-cross-block-audit-review.html`。
- 日志归档：`tests/artifacts/markdown-cross-block-audit-20260912.log`、`tests/artifacts/markdown-cross-block-table-regression-20260912.log`。

## 边界与清理

表格起点向外反向拖选在浏览器工具本次落为折叠光标，未形成需要的反向文本选区，所以没有把它计作真实反向表格拖选通过；对应反向文本选区的删除/替换、历史和重挂载自动化通过。未新增真实 IME、语音输入、Windows 或原生保存结论；最终整合由主任务独立验证。

产品修改仅 `tableLists.ts`、新增 `crossBlockInput.ts` 与组件导入/注册两处。本任务独立浏览器标签、5198 服务结束后关闭。
