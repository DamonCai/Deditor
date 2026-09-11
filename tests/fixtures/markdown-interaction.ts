/** Self-authored long document for cursor, editable-range and scrolling review. */
export const interactionMarkdown = [
  '# 长文编辑回归',
  '顶部连续输入位置。',
  '+ 普通列表\n+ [引用文字][guide] 和 <kbd>Ctrl</kbd>\n+ <span style="color: red">彩色列表</span><br>换行后仍可输入\n+ 下方列表可编辑',
  '| 左列 | 右列 |\n| --- | --- |\n| [表格引用][guide] | 下方单元格 |',
  ...Array.from({ length: 30 }, (_, index) => `## 中间章节 ${index + 1}\n\n这是自建的第 ${index + 1} 段正文，用于检查长文档输入时的位置稳定。`),
  '## 底部编辑区',
  '底部连续输入位置。',
  '```typescript\nconst bottom = "code";\n```',
  '<custom>特殊块原文</custom>',
  '[guide]: https://example.com "自建引用"',
  '搜索定位目标。',
].join('\n\n') + '\n';
