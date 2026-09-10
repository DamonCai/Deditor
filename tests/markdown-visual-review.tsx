// Only self-created documents. No application startup, persistence, or real files.
import React from "react";
import { createRoot } from "react-dom/client";
import MarkdownVisualEditor from "../src/components/MarkdownVisualEditor";
import MarkdownToolbar from "../src/components/MarkdownToolbar";
import EditorSlot from "../src/components/EditorSlot";
import HtmlPreview from "../src/components/HtmlPreview";
import HtmlToolbar from "../src/components/HtmlToolbar";
import XmindView from "../src/components/XmindView";
import { useEditorStore } from "../src/store/editor";
import { sampleArchive, sampleSheets } from "./fixtures/xmind";
import { bytesToXmindDataUrl } from "../src/lib/xmind/edit";
import { Button } from "../src/components/ui/Button";
import { flushDocument } from "../src/lib/documentFlush";
import "../src/styles.css";
// Browser-only asset URL substitute; native file IO is covered separately.
Object.defineProperty(window, "__TAURI_INTERNALS__", { value: { convertFileSrc: (path: string) => new URL(path, location.origin).href }, configurable: true });
const sample = '# 阅读时自然编辑\n\n这是**加粗**和 *斜体*，支持中文连续输入。\n\n## 任务清单\n\n+ [ ] 编写正文\n+ [x] 保留原文\n\n## 表格\n\n| 项目 | 状态 |\n| :--- | ---: |\n| 编辑器 | 就绪 |\n| 历史 | 待验证 |\n\n## 代码与公式\n\n```typescript\nconst message = "你好";\n```\n\n$$\nx^2 + y^2 = z^2\n$$\n\n```mermaid\ngraph LR\n  A[阅读] --> B[编辑]\n```\n\n## 扩展语法\n\n<span style="color:#e53e3e">彩色文字</span>\n\n[引用链接][ref]\n\n[ref]: https://example.com "保留定义"\n\n最后一段保留三空格。   \n';
const dark = new URLSearchParams(location.search).has("dark");
const docs = [ { id: "md-review", filePath: "/generated/visual-review.md", content: sample, savedContent: sample },
 { id: "md-other", filePath: "/generated/second.md", content: "# 第二个标签\n\n独立历史。\n", savedContent: "# 第二个标签\n\n独立历史。\n" },
 { id: "html-review", filePath: "/generated/isolated.html", content: "<h1>HTML 保持独立</h1><p>原有预览</p>", savedContent: "<h1>HTML 保持独立</h1><p>原有预览</p>" },
 { id: "xmind-review", filePath: "/generated/isolated.xmind", content: bytesToXmindDataUrl(sampleArchive(sampleSheets())), savedContent: bytesToXmindDataUrl(sampleArchive(sampleSheets())) },
 { id: "mdx-review", filePath: "/generated/component.mdx", content: 'import Card from "./Card"\n\n# MDX\n\n<Card value={1 + 2}>内容</Card>\n', savedContent: 'import Card from "./Card"\n\n# MDX\n\n<Card value={1 + 2}>内容</Card>\n' },
];
useEditorStore.setState({ tabs: docs, activeId: docs[0].id, markdownMode: "visual", language: "zh", theme: dark ? "dark" : "light" });
document.documentElement.classList.toggle("dark", dark);
function Review() {
 const id = useEditorStore(s => s.activeId)!;
 const tab = useEditorStore(s => s.tabs.find(t => t.id === id))!;
 const mode = useEditorStore(s => s.markdownMode);
 const theme = useEditorStore(s => s.theme);
 const [saved, setSaved] = React.useState("");
 const html = id === "html-review", xmind = id === "xmind-review";
 return <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
   <div className="document-toolbar" style={{ flexShrink: 0 }}>
     {docs.map(t => <Button size="sm" key={t.id} pressed={id === t.id} onClick={() => useEditorStore.setState({ activeId: t.id })}>{t.filePath.split("/").pop()}</Button>)}
     <Button size="sm" onClick={() => { const next = theme === "light" ? "dark" : "light"; useEditorStore.setState({ theme: next }); document.documentElement.classList.toggle("dark", next === "dark"); }}>主题</Button>
     <Button size="sm" onClick={() => { flushDocument(id); const text = useEditorStore.getState().tabs.find(t => t.id === id)!.content; setSaved(text); useEditorStore.getState().markSaved(); }}>保存快照</Button>
   </div>
   {html ? <HtmlToolbar /> : !xmind ? <MarkdownToolbar /> : null}
   <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
    {xmind ? <XmindView tabId={id} dataUrl={tab.content} filePath={tab.filePath} /> : html ? <><EditorSlot tabId={id} active theme={theme} fontSize={14} /><HtmlPreview tabId={id} /></> : <>
      <div style={{ flex: 1, minWidth: 0, display: mode === "visual" || mode === "read" ? "none" : "block" }}><EditorSlot key={id} tabId={id} active theme={theme} fontSize={14} /></div>
      {mode !== "source" && <div style={{ flex: 1, minWidth: 0 }}><MarkdownVisualEditor key={id} tabId={id} readonly={mode === "read"} theme={theme} /></div>}
    </>}
   </div>
   <details style={{ maxHeight: 160, overflow: "auto", flexShrink: 0 }}><summary>原文 / 保存快照 {tab.content === tab.savedContent ? "已保存" : "未保存"}</summary><pre data-testid="source">{tab.content}</pre><pre data-testid="saved">{saved}</pre></details>
 </div>;
}
const reviewRoot = createRoot(document.getElementById("root")!);
reviewRoot.render(<React.StrictMode><Review /></React.StrictMode>);
if (import.meta.hot) import.meta.hot.dispose(() => reviewRoot.unmount());
