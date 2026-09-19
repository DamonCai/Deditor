// README screenshots: real product components, generated documents, no persistence or native IO.
import React from 'react';
import { createRoot } from 'react-dom/client';
import EditorGroups from '../src/components/EditorGroups';
import StatusBar from '../src/components/StatusBar';
import { useEditorStore } from '../src/store/editor';
import { bytesToXmindDataUrl } from '../src/lib/xmind/edit';
import { sampleArchive, sampleSheets } from './fixtures/xmind';
import '../src/styles.css';

const article = `# 把想法写成清晰的方案

从一段文字开始，把 **说明、数据和代码** 放进同一份 Markdown 文档。

## 一份文档，三种写法

直接在排版后的正文中修改内容，也可以切回源码，或左右对照实时预览。

| 工作场景 | 常用操作 | 交付内容 |
| --- | --- | --- |
| 技术方案 | 编写正文、插入图表 | 设计文档 |
| 项目记录 | 编辑表格、勾选任务 | 进度周报 |
| 日常开发 | 修改代码、整理配置 | 源码与说明 |

## 从记录到交付

- [x] 梳理方案与关键结论
- [x] 补齐流程图和数据表格
- [ ] 导出文档，与团队分享

> 文字、表格与图表一起编辑，文件仍保存在本地。
`;
const diagram = `# 用文字描述流程

Mermaid 图表可以在块内切换编辑、实时预览与阅读。

\`\`\`mermaid
flowchart LR
  A[记录想法] --> B[编写方案]
  B --> C{评审通过?}
  C -->|继续完善| B
  C -->|通过| D[导出与分享]
\`\`\`

## 让公式与说明放在一起

$$
S = \\sum_{i=1}^{n} w_i \\cdot s_i
$$
`;
const code = `// 与右侧方案对照编辑
type Proposal = {
  title: string;
  status: 'draft' | 'ready';
  score: number;
};

const proposals: Proposal[] = [
  { title: '本地文档', status: 'ready', score: 92 },
  { title: '流程图表', status: 'ready', score: 88 },
  { title: '导出分享', status: 'draft', score: 85 },
];

export function readyToShare(items: Proposal[]) {
  return items
    .filter(item => item.status === 'ready')
    .sort((a, b) => b.score - a.score);
}
`;
const make = (id: string, fileName: string, content: string) => ({ id, filePath: `/generated/${fileName}`, content, savedContent: content });
const mapSheet = sampleSheets()[0];
mapSheet.rootTopic = {
  id: 'root', title: 'DEditor\n从想法到文档', structureClass: 'org.xmind.ui.map.unbalanced',
  children: { attached: [
    { id: 'writing', title: 'Markdown 写作', children: { attached: [
      { id: 'modes', title: '源码 / 实时预览 / 阅读编辑' },
      { id: 'table', title: '表格与任务列表' },
      { id: 'diagrams', title: '流程图与数学公式' },
    ] } },
    { id: 'coding', title: '代码与文本', children: { attached: [
      { id: 'languages', title: '多语言高亮' },
      { id: 'format', title: 'JSON / SQL 格式化' },
      { id: 'search', title: '跨文件搜索与替换' },
    ] } },
    { id: 'workspace', title: '本地工作区', children: { attached: [
      { id: 'split', title: '多标签与左右分屏' },
      { id: 'diff', title: '文件差异比较' },
      { id: 'history', title: '历史版本与草稿恢复' },
    ] } },
    { id: 'delivery', title: '整理与交付', children: { attached: [
      { id: 'mindmap', title: '思维导图编辑' },
      { id: 'images', title: '本地图片整理' },
      { id: 'export', title: 'HTML / PDF / DOCX 导出' },
    ] } },
  ] },
};
delete mapSheet.relationships;
const tabs = [make('article', '方案说明.md', article), make('diagram', '流程与公式.md', diagram), make('code', 'proposal.ts', code), make('map', '产品设计.xmind', bytesToXmindDataUrl(sampleArchive([mapSheet])))];
const scene = new URLSearchParams(location.search).get('scene') ?? 'article';
const dark = scene === 'split';
document.documentElement.classList.toggle('dark', dark);
useEditorStore.setState({ tabs, activeId: scene === 'split' ? 'code' : scene === 'diagram' ? 'diagram' : scene === 'map' ? 'map' : 'article', activePane: 'left', panes: null, markdownMode: 'visual', language: 'zh', theme: dark ? 'dark' : 'light', autoSave: 'off', editorFontSize: 16, showPreview: true });
if (scene === 'split') {
  useEditorStore.getState().splitRight('article');
}
const root = createRoot(document.getElementById('root')!);
root.render(<div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}><EditorGroups initialPreviewPct={50}/><StatusBar/></div>);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
