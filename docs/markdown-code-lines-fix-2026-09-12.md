# Markdown 代码块末尾多一行（2026-09-12）

范围仅为用户截图中的代码块行数差异：源码 3 行命令与 2 行空白，预览却显示 6 行。截图中的命令仅作为文本理解，未执行；验证使用自建 echo 文本样例。

## 原因与修复

`markdown-it` 的围栏 token content 带一个终止换行，直接送入 Shiki 会生成额外的空 `.line`。`src/lib/markdown.ts` 在普通围栏高亮前仅移除一个末尾换行，同时覆盖纯文本回退；不使用 trimEnd，保留真实空行、空格和制表符。实时预览和阅读代码块沿用同一渲染入口，因此同步修正。独立代码文件的 `renderCode` 保留原有末尾换行语义。

## 验证

- 修复前直接调用真实 `renderMarkdown` 复现 5 行正文生成 6 个 `.line`；修复后生成 5 个。
- 新增 `npm run test:markdown-code-lines` 并接入 `test:all`：32 项通过，覆盖亮/暗主题、空围栏、首尾及中间空行、空格/制表符、未知语言、CRLF、波浪线围栏、引用/列表、未闭合围栏和独立代码文件。
- 自建 `tests/markdown-code-lines-review.html` 使用实际 EditorSlot、Preview 和 MarkdownVisualEditor。真实浏览器显示源码正文第 4–8 行、预览第 1–5 行；切换阅读后两端均为 5 行。展开的 CodeMirror 行号也为 1–5。
- 代码末尾直接按 Enter 增加空行、Esc 收起后，阅读/预览均为 6 行，原文恰多一个换行；撤销后两端回到 5 行，整篇原文精确等于初始样例。暗色主题下两端仍为 5 行。
- 13 项已有导出回归、47 组语法样例与扩展名加载检查通过；TypeScript 与生产构建通过（已有大 chunk 提示）。`git diff --check` 通过。

本次未重新打包或验证原生应用，不新增 Windows/真实 IME 验收结论；未提交推送。工作区另有独立阅读编辑操作修复，已保留；上述结果不代表该并行工作整体通过。

## English

Fixed one extra displayed line in fenced Markdown code blocks by removing exactly the parser's terminal newline before highlighting. Intentional whitespace and standalone code files are preserved. Verified 32 targeted cases, real browser source/preview/visual parity, editing and exact undo, syntax/export regressions, and the production build. Native application validation was outside this scoped fix.
