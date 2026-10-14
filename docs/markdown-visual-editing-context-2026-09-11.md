# Markdown 阅读编辑接续

本页保留当前架构入口；历史实施与逐轮验收记录可从 Git 历史恢复。实际行为以当前代码和[待办](pending-tasks.md)为准。

阅读编辑目标是在排版后的 Markdown 中直接写作，同时保留源码、实时预览、表格、图片、公式和图表操作。三个视图共享文件内容与历史；保存、撤销、重做和模式切换需要核对原文，不得静默改写未编辑部分。

| 层次 | 入口 |
| --- | --- |
| 编辑器组件和落点 | `src/components/MarkdownVisualEditor.tsx`、`src/lib/markdownVisual/` |
| 源码、标签和历史 | `src/store/editor.ts`、`src/lib/markdownHistory.ts` |
| 共享展示 | `src/components/MarkdownDocumentSurface.tsx`、`src/lib/markdownDisplay.ts`、`src/preview.css` |
| 文件与恢复 | `src/lib/fileio.ts`、`src/lib/persistence.ts`、`src-tauri/src/markdown_history.rs` |
| 自建浏览器样例 | `tests/markdown-visual-review.html` |

最近的图块滚动与整表拖动范围见[本轮记录](markdown-block-drag-2026-10-14.md)。公式后可见光标和中文输入的原生边界见[公式记录](markdown-math-composition-2026-10-07.md)。长文与恢复的有界测量见[阅读性能](markdown-reading-performance-2026-09-24.md)和[原生传输性能](markdown-native-performance-2026-09-24.md)。这些结果各自只覆盖记录中的平台、样例和版本。
