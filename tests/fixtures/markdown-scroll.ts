/** Tall blocks and wrapped lines exercise viewport movement during editing. */
export const scrollMarkdown = [
 '# 输入位置稳定性',
 ...Array.from({length:12},(_,i)=>`## 前置章节 ${i+1}\n\n自建正文用于铺满页面。`),
 '## 图表编辑区',
 '```mermaid\ngraph TD\n  A[开始] --> B[分析]\n  B --> C[编辑]\n  C --> D[验证]\n  D --> E[完成]\n```',
 '图表之后仍在当前位置输入。',
 '```typescript\n'+Array.from({length:24},(_,i)=>`const line${i+1} = "自建测试内容";`).join('\n')+'\n```',
 '末尾连续输入位置。',
].join('\n\n')+'\n';
