// Generated fixture only; no user files or persisted state are read.
import React from "react";
import { createRoot } from "react-dom/client";
import Visual from "../src/components/MarkdownVisualEditor";
import Preview from "../src/components/Preview";
import { useEditorStore } from "../src/store/editor";
import "../src/styles.css";

// Self-contained copy of the reported SVG shape. The user's file is never
// read or written by this review page.
const source = [
  "",
  "",
  "```html",
  '<svg width="100%" viewBox="0 0 680 360" style="font-family:system-ui,sans-serif">',
  '<defs><marker id="a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>',
  "",
  '<rect x="8" y="176" width="440" height="74" rx="12" fill="none" stroke="var(--sky-200)" stroke-dasharray="4 3"/>',
  '<text x="18" y="191" font-size="11" font-weight="600" fill="var(--sky-600)">关联层 · 设备与手机号</text>',
  "",
  '<rect x="460" y="176" width="212" height="74" rx="12" fill="var(--rose-50)" stroke="var(--rose-400)" stroke-dasharray="4 3"/>',
  '<text x="470" y="191" font-size="11" font-weight="600" fill="var(--rose-600)">已排除 · 不得打击</text>',
  "</svg>",
  "```",
  "",
  "",
].join("\n");

useEditorStore.setState({
  tabs: [{ id: "html-code-review", filePath: "/generated/测试-copy.md", content: source, savedContent: source }],
  activeId: "html-code-review",
  language: "zh",
  theme: "light",
  markdownMode: "visual",
  autoSave: "off",
});

function Review() {
  const [mode, setMode] = React.useState<"preview" | "visual">("preview");
  const [narrow, setNarrow] = React.useState(false);
  const theme = useEditorStore(s => s.theme);
  const current = useEditorStore(s => s.tabs[0].content);
  return <main style={{ width: narrow ? 720 : "100%", height: "100vh", display: "flex", flexDirection: "column" }}>
    <nav>
      <button onClick={() => setMode("preview")}>实时预览</button>
      <button onClick={() => setMode("visual")}>阅读</button>
      <button onClick={() => setNarrow(value => !value)}>切换720px</button>
      <button onClick={() => {
        const next = theme === "light" ? "dark" : "light";
        document.documentElement.classList.toggle("dark", next === "dark");
        useEditorStore.setState({ theme: next });
      }}>切换主题</button>
      <output>{mode}</output>
    </nav>
    <section style={{ flex: 1, minHeight: 0 }}>
      {mode === "preview"
        ? <Preview tabId="html-code-review" active theme={theme} />
        : <Visual tabId="html-code-review" theme={theme} />}
    </section>
    <pre data-testid="source" style={{ maxHeight: 110, overflow: "auto" }}>{current}</pre>
  </main>;
}

const root = createRoot(document.getElementById("root")!);
root.render(<Review />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
