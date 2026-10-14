// Generated fixtures only; never load persisted state or user files.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import DiffView from "../src/components/DiffView";
import { Button } from "../src/components/ui/Button";
import { useEditorStore } from "../src/store/editor";
import "../src/styles.css";
const original = Array.from({ length: 120 }, (_, i) => `第 ${i + 1} 行：自建文件对比样例，保留相同行和原始行号。`).join("\n");
const changed = original.replace("第 10 行", "修改第十行").replace("第 60 行", "修改第六十行").replace("第 110 行", "修改第一百一十行");
useEditorStore.setState({ language: "zh", tabs: [], activeId: null });
function Review() {
  const [identical, setIdentical] = useState(false);
  return <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
    <div style={{ display: "flex", gap: 8, padding: 8 }}>
      <Button onClick={() => document.documentElement.classList.toggle("dark")}>亮暗主题</Button>
      <Button onClick={() => useEditorStore.setState({ language: useEditorStore.getState().language === "zh" ? "en" : "zh" })}>中英文</Button>
      <Button onClick={() => setIdentical(value => !value)}>切换相同文件</Button>
    </div>
    <div style={{ flex: 1, minHeight: 0 }}><DiffView spec={{ leftPath: "/generated/原始.md", rightPath: "/generated/修改.md", leftContent: original, rightContent: identical ? original : changed }} /></div>
  </div>;
}
createRoot(document.getElementById("root")!).render(<Review />);
