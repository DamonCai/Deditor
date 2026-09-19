// Local review fixture. The imported artifact is ignored by Git and is a
// read-only copy; the user's source file is never written by this page.
import React from "react";
import { createRoot } from "react-dom/client";
import Preview from "../src/components/Preview";
import Visual from "../src/components/MarkdownVisualEditor";
import { useEditorStore } from "../src/store/editor";
import source from "./artifacts/markdown-html-fence-2026-09-14/current-user-review.md?raw";
import "../src/styles.css";

const started = performance.now();
useEditorStore.setState({
  tabs: [{ id: "current-html-review", filePath: "/generated/current-user-review.md", content: source, savedContent: source }],
  activeId: "current-html-review", language: "zh", theme: "light", markdownMode: "visual", autoSave: "off",
});

function Review() {
  const [mode, setMode] = React.useState<"preview" | "visual">("preview");
  const theme = useEditorStore(state => state.theme);
  React.useEffect(() => {
    let frame = 0;
    const check = () => {
      const svg = document.querySelector(".html-render-block > svg");
      if (svg) document.documentElement.dataset.renderMs = (performance.now() - started).toFixed(2);
      else frame = requestAnimationFrame(check);
    };
    frame = requestAnimationFrame(check);
    return () => cancelAnimationFrame(frame);
  }, [mode]);
  return <main style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
    <nav>
      <button onClick={() => setMode("preview")}>实时预览</button>
      <button onClick={() => setMode("visual")}>阅读</button>
      <button onClick={() => {
        const next = theme === "light" ? "dark" : "light";
        document.documentElement.classList.toggle("dark", next === "dark");
        useEditorStore.setState({ theme: next });
      }}>切换主题</button>
      <output data-testid="mode">{mode}</output>
    </nav>
    <section style={{ flex: 1, minHeight: 0 }}>
      {mode === "preview" ? <Preview tabId="current-html-review" active theme={theme} /> : <Visual tabId="current-html-review" theme={theme} />}
    </section>
  </main>;
}

createRoot(document.getElementById("root")!).render(<Review />);
