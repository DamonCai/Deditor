/** Self-created visual parity cases; no user files or external images. */
export const presentationMarkdown = `# 一级标题

正文包含**粗体**、*斜体*、~~删除线~~、\`inline code\`、[链接](https://example.com)、<kbd>Enter</kbd>。

## 二级标题
### 三级标题
#### 四级标题
##### 五级标题
###### 六级标题

> 引用第一段。
>
> 引用第二段包含**重点**。

- 无序第一项
- 无序第二项
  - 子项甲
  - 子项乙

1. 有序第一项
2. 有序第二项

- [ ] 未完成任务
- [x] 已完成任务

| 左对齐 | 中间 | 右对齐 |
| :--- | :---: | ---: |
| 简短 | **粗体** | 123 |
| 较长的中文单元格 | \`code\` | 456 |

---

\`\`\`typescript
const message = "中文";
function greet() {
  return message;
}
\`\`\`

行内公式 $x^2 + y^2$。

$$
\\frac{1}{2} + x^2 = y
$$

\`\`\`mermaid
graph LR
  A[阅读] --> B[编辑]
\`\`\`

![自建图形](/tests/fixtures/markdown-presentation.svg)

[引用链接][ref]

[ref]: https://example.com "保留定义"

末尾段落。
`;
