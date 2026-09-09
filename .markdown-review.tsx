import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Preview from './src/components/Preview';
import { useEditorStore } from './src/store/editor';
import './src/styles.css';
const source = `# 写作，回到内容本身

好的排版让信息自然呈现。从一段笔记到一份技术文档，**清晰的层次**与适度的留白，让阅读变得轻松。DEditor 支持 Markdown 与多语言代码的实时预览。

## 从想法到文档

把复杂的问题拆成简单的步骤。用 \`Markdown\` 记录思路，用 [目录跳转](#代码与数据) 定位内容，也可以使用 <kbd>⌘</kbd> + <kbd>S</kbd> 保存。

> 设计应该让内容更容易理解。好的工具安静地待在一旁，让思考自然发生。
>
> Keep the focus on your words.

- **整理思路**：用标题建立文档结构。
  - 先描述问题，再展开解决方案。
  - 中英文混排保持舒适的阅读节奏。
- **保留细节**：代码、表格和图表各有自己的表达方式。

## 代码与数据

\`\`\`typescript
interface DocumentOptions {
  theme: "light" | "dark";
  autoSave: boolean;
}

const options: DocumentOptions = {
  theme: "light",
  autoSave: true,
};
\`\`\`

| 功能 | 说明 | 状态 |
| :--- | :--- | ---: |
| 实时预览 | 编辑与阅读同步更新 | 已支持 |
| 语法高亮 | TypeScript、Rust、Python | 已支持 |
| 本地文件 | Markdown 与多媒体内容 | 已支持 |

### 发布前的检查

- [x] 检查标题层级与链接
- [ ] 完成内容校对

---

## 边界情况

超长链接：[https://example.com/${'a'.repeat(160)}](https://example.com)

\`\`\`text
${'a_very_long_unbroken_code_line_'.repeat(12)}
\`\`\`

| ${'WideColumn'.repeat(18)} | 第二列 |
| --- | --- |
| content | detail |

\`\`\`mermaid
graph LR
  A[编辑] --> B[预览] --> C[保存]
\`\`\`

$$
E = mc^2
$$

### 文档结尾

最后一段文字，用于验证目录与滚动。
`;
const id = useEditorStore.getState().openTab('/review.md', source);
const codeId = useEditorStore.getState().openTab('/review.ts', 'const theme = "light";');
useEditorStore.setState({activeId: id, previewMaximized: true, tocVisible: true});
function Review() {
  const [theme, setTheme] = useState<'light'|'dark'>('light');
  const [narrow, setNarrow] = useState(false);
  const [tabId, setTabId] = useState(id);
  return <><nav style={{height:40,display:'flex',gap:16,alignItems:'center',padding:'0 20px',borderBottom:'1px solid var(--border)'}}>
    <button onClick={()=>{const next=theme==='light'?'dark':'light';setTheme(next);document.documentElement.classList.toggle('dark',next==='dark');}}>切换主题</button>
    <button onClick={()=>{setNarrow(!narrow);useEditorStore.setState({previewMaximized:narrow});}}>切换分栏</button>
    <button onClick={()=>{const next=tabId===id?codeId:id;setTabId(next);useEditorStore.setState({activeId:next});}}>切换文件</button>
  </nav><main style={{height:'calc(100% - 40px)',width:narrow?'360px':'100%'}}><Preview tabId={tabId} active theme={theme}/></main></>;
}
createRoot(document.getElementById('root')!).render(<Review/>);
