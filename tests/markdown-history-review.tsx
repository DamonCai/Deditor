// Generated fixtures only. This page never reads app state or user files.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import MarkdownHistoryDialog from "../src/components/MarkdownHistoryDialog";
import { Button } from "../src/components/ui/Button";
import { useEditorStore } from "../src/store/editor";
import "../src/styles.css";
import "../src/components/markdown-writing-settings.css";
const query = new URLSearchParams(location.search);
const dark = query.has("dark"), language = query.has("en") ? "en" : "zh";
const original = Array.from({ length: 120 }, (_, i) => `${i + 1}. 自建历史样例：保持原文、行号与中文 👨‍👩‍👧‍👦 完整。`).join("\n") + "\n";
const current = original.replace("10. 自建历史样例", "10. 第一处修改").replace("60. 自建历史样例", "60. 第二处修改").replace("110. 自建历史样例", "110. 第三处修改");
const path = "/generated/历史版本全览/包含较长路径的自建中文测试文档.md";
const samples: Record<string, string> = { old: original, same: current, empty: "", draft: original, unicode: "# 空白与 Unicode\n\n中文 é 👨‍👩‍👧‍👦\n" };
Object.defineProperty(window, "__TAURI_INTERNALS__", { configurable: true, value: {
  invoke: async (command: string, args: { path?: string; id?: string }) => {
    if (command === "list_markdown_history") return (args.path === null ? ["draft"] : ["old", "same", "empty", "unicode", "error"]).map((id, i) => ({ id, path: id === "draft" ? "/generated/另一个文档.md" : path, timestamp: Date.UTC(2026, 8, 20, 4, 30 - i), draft: id === "draft", bytes: samples[id]?.length ?? 0 }));
    if (command === "read_markdown_history") {
      if (args.id === "error") throw new Error("Generated history read error. ".repeat(60));
      return samples[args.id!];
    }
  }, convertFileSrc: (path: string) => path,
} });
useEditorStore.setState({ tabs: [{ id: "history-review", filePath: path, content: current, savedContent: original }], activeId: "history-review", language, theme: dark ? "dark" : "light" });
document.documentElement.classList.toggle("dark", dark);
function Review() {
  const [open, setOpen] = useState(true);
  return <><Button onClick={() => setOpen(true)}>打开历史 / Open history</Button>{open && <MarkdownHistoryDialog tabId="history-review" onClose={() => setOpen(false)} />}</>;
}
createRoot(document.getElementById("root")!).render(<Review />);
