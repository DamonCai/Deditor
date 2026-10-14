// Generated fixture only; no user files or persisted state are read.
import React from "react";
import { createRoot } from "react-dom/client";
import Visual from "../src/components/MarkdownVisualEditor";
import Preview from "../src/components/Preview";
import { useEditorStore } from "../src/store/editor";
import "../src/styles.css";

const variants = ["html", "HTML", "Html", "hTmL"];
const standardSource = variants.map((language, index) => {
  const tag = index % 2 ? "SVG" : "svg";
  const rect = index % 2 ? "RECT" : "rect";
  const text = index % 2 ? "TEXT" : "text";
  return [
    `## ${language}`,
    `\`\`\`${language}`,
    `<${tag} id="case-${language}" width="100%" viewBox="0 0 240 140">`,
    `<${rect} x="10" y="52" width="220" height="48" rx="8" fill="none" stroke="var(--sky-200)"/>`,
    `<${text} x="20" y="78" fill="var(--sky-600)">${language} mixed-case tags</${text}>`,
    `<${rect} x="160" y="60" width="50" height="24" fill="var(--rose-50)" stroke="var(--rose-400)"/>`,
    `</${tag}>`,
    "```",
  ].join("\n");
}).join("\n\n");
const escapedSource = [
  "## escaped HTML",
  "\\``` ` ``\\`HTML",
  '<SVG id="case-escaped-HTML" width="100%" viewBox="0 0 240 140">',
  '<RECT x="10" y="52" width="220" height="48" rx="8" fill="none" stroke="var(--sky-200)"/>',
  '<TEXT x="20" y="78" fill="var(--sky-600)">escaped HTML fence</TEXT>',
  '<RECT x="160" y="60" width="50" height="24" fill="var(--rose-50)" stroke="var(--rose-400)"/>',
  "</SVG>",
  "\\```",
].join("\n");
const source = `${standardSource}\n\n${escapedSource}`;

useEditorStore.setState({
  tabs: [{ id: "html-case-review", filePath: "/generated/html-case-review.md", content: source, savedContent: source }],
  activeId: "html-case-review",
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
      <output data-testid="mode">{mode}</output>
    </nav>
    <section data-testid="stage" style={{ flex: 1, minHeight: 0 }}>
      {mode === "preview"
        ? <Preview tabId="html-case-review" active theme={theme} />
        : <Visual tabId="html-case-review" theme={theme} />}
    </section>
    <pre data-testid="source" style={{ maxHeight: 100, overflow: "auto" }}>{current}</pre>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Review />);
