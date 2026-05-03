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

// Idle-time prefetch of the chunks the user is most likely to need next.
// Cold start has already painted by the time idle fires, so this hides the
// network/parse cost of these lazy modules behind a "free" idle slice.
// First click on a markdown preview / commit panel / diff tab then has the
// chunk already warm in the browser cache.
function idlePrefetch(): void {
  void import("./components/Preview");
  void import("./components/CommitPanel");
  void import("./components/DiffView");
  void import("./components/SettingsDialog");
  void import("./components/GotoAnything");
  void import("./components/CommandPalette");
}
type IdleCb = (cb: IdleRequestCallback, opts?: { timeout: number }) => number;
const ric = (window as unknown as { requestIdleCallback?: IdleCb })
  .requestIdleCallback;
if (ric) ric(() => idlePrefetch(), { timeout: 5000 });
else setTimeout(idlePrefetch, 2000);
