import { arrowNavigationMarkdown, arrowNavigationContextMarkdown, basicEditingMarkdown } from "./fixtures/markdown-arrow-navigation";
import typoraFixture from "./fixtures/markdown-typora-complete.md?raw";
import { checkMarkdownPresentation } from "./markdown-presentation-check";
import complexMarkdown from "./fixtures/markdown-complex.md?raw";
import { imeMarkdown } from "./fixtures/markdown-ime";
import { scrollMarkdown } from "./fixtures/markdown-scroll";
import { presentationMarkdown } from "./fixtures/markdown-presentation";
import { interactionMarkdown } from "./fixtures/markdown-interaction";
// Only self-created documents. No application startup, persistence, or real files.
import React from "react";
import { MarkdownDocument } from "../src/lib/markdownVisual/document";
import { EditorView as ProseView } from "@milkdown/kit/prose/view";
import { EditorState as ProseState } from "@milkdown/kit/prose/state";
const timings: string[] = [];
const timingRestores: (() => void)[] = [];
const profiledViews = new WeakSet<object>();
if (new URLSearchParams(location.search).has("long")) {
  for (const [prototype, methods] of [
    [MarkdownDocument.prototype, ['apply', 'sourceOffset', 'reset', 'index']],
    [ProseView.prototype, ['updateState', 'updatePluginViews', 'scrollToSelection']], [ProseState.prototype, ['applyTransaction']],
  ] as const) for (const method of methods) {
    const target = prototype as unknown as Record<string, (...args: any[]) => any>;
    const original = target[method];
    target[method] = function (...args: any[]) {
      // Test-only profiling of upstream plugin views; never used by the application.
      if (method === 'updatePluginViews') {
        const editor = this as any;
        const plugins = [...(editor.directPlugins ?? []), ...editor.state.plugins].filter((plugin: any) => plugin.spec.view);
        editor.pluginViews?.forEach((plugin: any, index: number) => {
          if (!plugin.update || profiledViews.has(plugin)) return;
          profiledViews.add(plugin); const update = plugin.update;
          plugin.update = function (...values: any[]) { const begin = performance.now(); try { return update.apply(this, values); } finally { const duration = performance.now() - begin; if (duration > 1) timings.push(`${plugins[index]?.key ?? index}:${duration.toFixed(1)}`); } };
        });
      }
      const start = performance.now(); try { return original.apply(this, args); } finally { timings.push(`${method}:${(performance.now() - start).toFixed(1)}`); }
    };
    timingRestores.push(() => { target[method] = original; });
  }
}
import { createRoot } from "react-dom/client";
import MarkdownVisualSlot from "../src/components/MarkdownVisualSlot";
import Preview from "../src/components/Preview";
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
const ime = new URLSearchParams(location.search).has("ime");
const parity = new URLSearchParams(location.search).has("parity");
const dark = new URLSearchParams(location.search).has("dark");
const imageRootFixture = complexMarkdown.replaceAll('/tests/fixtures/', '/').replace('revision: 1', 'revision: 1\ntypora-root-url: /tests/fixtures').replace('# 综合文档 H1', '# 综合文档 H1\n\n![根目录块图](/markdown-review.svg)\n\n行内根目录图片 ![根目录行内图](/markdown-presentation.svg)\n\n<figure><img src="/markdown-review.svg" alt="根目录 HTML 图"></figure>');
const longReview = new URLSearchParams(location.search).has("long");
const sectionCount = Math.max(1, Math.min(1000, Number(new URLSearchParams(location.search).get("sections")) || 100));
const longFixture = complexMarkdown.replace('## 文末验收', Array.from({ length: sectionCount }, (_, i) => `## 性能第 ${i + 1} 节\n\n性能输入定位点 ${i + 1}：中文正文与 **强调内容**，${"长文光标、原文和页面位置核对。".repeat(12)}\n\n> 引用 **重点**\n>\n> - 嵌套项目\n\n| 名称 | 数量 |\n| --- | ---: |\n| **表格正文** | ${i + 1} |\n`).join('\n') + '\n## 文末验收');
const fixture = new URLSearchParams(location.search).has("basic-editing") ? basicEditingMarkdown : new URLSearchParams(location.search).has("arrow-context") ? arrowNavigationContextMarkdown : new URLSearchParams(location.search).has("arrows") ? arrowNavigationMarkdown : new URLSearchParams(location.search).has("typora") ? typoraFixture : longReview ? longFixture : new URLSearchParams(location.search).has("image-root") ? imageRootFixture : new URLSearchParams(location.search).has("complex") ? complexMarkdown : ime ? imeMarkdown : new URLSearchParams(location.search).has("scroll") ? scrollMarkdown : new URLSearchParams(location.search).has("presentation") ? presentationMarkdown : new URLSearchParams(location.search).has("interaction") ? interactionMarkdown : sample;
const docs = [ { id: "md-review", filePath: "/generated/visual-review.md", content: fixture, savedContent: fixture },
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
 const [parityResult, setParityResult] = React.useState<ReturnType<typeof checkMarkdownPresentation> | null>(null);
 const [saved, setSaved] = React.useState("");
 const [samples, setSamples] = React.useState<string[]>([]);
 const [modeSamples, setModeSamples] = React.useState<string[]>([]);
 React.useEffect(() => {
   if (!longReview) return;
   let pending = 0;
   const unsubscribe = useEditorStore.subscribe((next, previous) => {
     if (next.markdownMode === previous.markdownMode && next.activeId === previous.activeId) return;
     cancelAnimationFrame(pending);
     timings.length = 0;
     const started = performance.now(), expected = next.markdownMode, active = next.activeId;
     const check = () => {
       const current = useEditorStore.getState();
       if (current.markdownMode !== expected || current.activeId !== active) return;
       const ready = expected === "visual" ? document.querySelector('.ProseMirror[contenteditable="true"]') : expected === "source" ? document.querySelector('.cm-editor') : document.querySelector('.preview h1');
       if (!ready) { pending = requestAnimationFrame(check); return; }
       pending = requestAnimationFrame(() => setModeSamples(values => [...values.slice(-11), `${expected}:${(performance.now()-started).toFixed(1)}ms ${timings.filter(value => /^(reset|index|updateState):/.test(value)).join(" ")}`]));
     };
     pending = requestAnimationFrame(check);
   });
   return () => { unsubscribe(); cancelAnimationFrame(pending); };
 }, []);
 React.useEffect(() => {
   if (!longReview) return;
   let start = 0, events: string[] = [];
   const stamp = (name: string) => events.push(`${name}:${(performance.now() - start).toFixed(1)}`);
   const key = (event: KeyboardEvent) => {
     if (event.key.length !== 1 || event.metaKey || event.ctrlKey || event.altKey) return;
     start = performance.now(); timings.length = 0; events = [((event.target as Element)?.closest('.ProseMirror')) ? 'editor' : 'control'];
     queueMicrotask(() => stamp('microtask'));
     requestAnimationFrame(() => { stamp('frame1'); requestAnimationFrame(() => {
       stamp('frame2'); setSamples(values => [...values.slice(-5), [...events, ...timings].join(' ')]);
     }); });
   };
   const before = () => stamp('beforeinput'), input = () => stamp('input'), up = () => stamp('keyup');
   document.addEventListener('keydown', key, true);
   document.addEventListener('beforeinput', before, true);
   document.addEventListener('input', input, true);
   document.addEventListener('keyup', up, true);
   return () => {
     document.removeEventListener('keydown', key, true);
     document.removeEventListener('beforeinput', before, true);
     document.removeEventListener('input', input, true);
     document.removeEventListener('keyup', up, true);
   };
 }, []);
 const html = id === "html-review", xmind = id === "xmind-review";
 return <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
   <div className="document-toolbar" style={{ flexShrink: 0 }}>
     {docs.map(t => <Button size="sm" key={t.id} pressed={id === t.id} onClick={() => useEditorStore.setState({ activeId: t.id })}>{t.filePath.split("/").pop()}</Button>)}
     <Button size="sm" onClick={() => { const next = theme === "light" ? "dark" : "light"; useEditorStore.setState({ theme: next }); document.documentElement.classList.toggle("dark", next === "dark"); }}>主题</Button>
     {parity && <Button size="sm" onClick={() => setParityResult(checkMarkdownPresentation())}>检查呈现一致性</Button>}
     {ime && <>
       <Button size="sm" onMouseDown={event => event.preventDefault()} onClick={() => document.querySelector(".md-document")?.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }))}>模拟开始组词</Button>
       <Button size="sm" onMouseDown={event => event.preventDefault()} onClick={() => { const scroller = document.querySelector(".md-visual-scroll"); if (scroller) scroller.scrollTop += 172; }}>模拟输入法滚动</Button>
       <Button size="sm" onMouseDown={event => event.preventDefault()} onClick={() => document.querySelector(".md-document")?.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "" }))}>模拟结束组词</Button>
     </>}
     <Button size="sm" onClick={() => { flushDocument(id); const text = useEditorStore.getState().tabs.find(t => t.id === id)!.content; setSaved(text); useEditorStore.getState().markSaved(); }}>保存快照</Button>
   </div>
   {parityResult && <output data-testid="presentation-check" style={{ flexShrink: 0, height: 48, overflow: "auto", fontSize: 12 }}>{JSON.stringify(parityResult)}</output>}
   {longReview && <output data-testid="input-frame-timings" style={{ flexShrink: 0, height: 64, overflow: "auto", fontSize: 12 }}>输入事件与画面计时（ms，非 IME）：{samples.join(' / ')}</output>}
   {longReview && <output data-testid="mode-latencies">模式就绪与下一帧：{modeSamples.join(" / ")}</output>}
   {longReview && <input aria-label="原生输入框计时对照" placeholder="原生输入框计时对照" />}
   {html ? <HtmlToolbar /> : !xmind ? <MarkdownToolbar /> : null}
   <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
    {xmind ? <XmindView tabId={id} dataUrl={tab.content} filePath={tab.filePath} /> : html ? <><EditorSlot tabId={id} active theme={theme} fontSize={14} /><HtmlPreview tabId={id} /></> : <>
      <div style={{ flex: 1, minWidth: 0, display: parity || mode === "visual" ? "none" : "block" }}><EditorSlot key={id} tabId={id} active theme={theme} fontSize={14} /></div>
      {parity && <div data-testid="parity-preview" style={{ flex: 1, minWidth: 0 }}><Preview tabId={id} theme={theme} /></div>}
      {mode === "split" && <div style={{ flex: 1, minWidth: 0 }}><Preview key={id} tabId={id} theme={theme} active /></div>}
      <MarkdownVisualSlot key={id} tabId={id} active={mode === "visual"} theme={theme} />
    </>}
   </div>
   <details style={{ maxHeight: 160, overflow: "auto", flexShrink: 0 }}><summary>原文 / 保存快照 {tab.content === tab.savedContent ? "已保存" : "未保存"}</summary><pre data-testid="source">{tab.content}</pre><pre data-testid="saved">{saved}</pre></details>
 </div>;
}
const reviewRoot = createRoot(document.getElementById("root")!);
reviewRoot.render(<React.StrictMode><Review /></React.StrictMode>);
if (import.meta.hot) import.meta.hot.dispose(() => { reviewRoot.unmount(); timingRestores.forEach(restore => restore()); });
