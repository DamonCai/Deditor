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
{
  let knownIds = new Set(useEditorStore.getState().tabs.map((t) => t.id));
  useEditorStore.subscribe((s) => {
    const cur = new Set(s.tabs.map((t) => t.id));
    for (const id of knownIds) {
      if (!cur.has(id)) dropEditorStateCache(id);
    }
    knownIds = cur;
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
