import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installGlobalLogHandlers } from "./lib/logger";
import { useEditorStore } from "./store/editor";
import { dropEditorStateCache } from "./components/Editor";
import "./styles.css";

installGlobalLogHandlers();

// Prune the per-tab CodeMirror state cache whenever tabs disappear (closed,
// closeOthers, replaceTabs from persistence rehydrate). Subscribing once at
// boot avoids leaking cache entries forever as the user opens many tabs.
//
// IMPORTANT: zustand replaces the `tabs` array on every `setContent` call
// (because the action does `tabs.map(...)`). So `next.tabs !== prev.tabs`
// fires on EVERY keystroke. We can't gate on identity alone. Cheap O(1)
// structural check: same length AND same first/last id rules out
// open/close/replaceTabs — the only operations that need pruning. Reorders
// keep all ids, so skipping them is also correct (nothing to drop).
useEditorStore.subscribe((next, prev) => {
  if (next.tabs === prev.tabs) return;
  const a = next.tabs, b = prev.tabs;
  if (
    a.length === b.length &&
    a[0]?.id === b[0]?.id &&
    a[a.length - 1]?.id === b[b.length - 1]?.id
  ) {
    return;
  }
  const liveIds = new Set<string>();
  for (const t of a) liveIds.add(t.id);
  for (const t of b) {
    if (!liveIds.has(t.id)) dropEditorStateCache(t.id);
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
