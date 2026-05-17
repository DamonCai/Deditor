// DEditor performance probe — paste this whole file into the WebView
// DevTools Console (right-click → Inspect, or Cmd+Option+I in dev mode),
// then call DPerf.stress() to run the cascade.
//
// Outputs:
//   - per-store-action count and the fields that changed
//   - estimated re-render fanout (which components subscribed re-ran)
//
// It hooks zustand's setState. No source-code changes needed.

(function () {
  if (window.DPerf) {
    console.warn("DPerf already installed");
    return;
  }
  const store = window.__DEDITOR_STORE__;
  if (!store) {
    console.error(
      "store not exposed. Add to store/editor.ts (dev only):\n" +
      "  if (typeof window !== 'undefined') (window).__DEDITOR_STORE__ = useEditorStore;",
    );
    return;
  }

  let setCount = 0;
  let perAction = new Map();      // action label → count
  let fieldChangeCount = new Map(); // field → count
  let lastState = store.getState();

  const origSet = store.setState;
  store.setState = function (updater, replace) {
    setCount++;
    const ret = origSet(updater, replace);
    const next = store.getState();
    for (const k of Object.keys(next)) {
      if (next[k] !== lastState[k]) {
        fieldChangeCount.set(k, (fieldChangeCount.get(k) || 0) + 1);
      }
    }
    lastState = next;
    return ret;
  };

  function tag(label, fn) {
    perAction.set(label, (perAction.get(label) || 0) + 1);
    const t0 = performance.now();
    fn();
    const dt = performance.now() - t0;
    console.log(`[${label}] ${dt.toFixed(2)}ms`);
  }

  function reset() {
    setCount = 0;
    perAction.clear();
    fieldChangeCount.clear();
    lastState = store.getState();
  }

  function report() {
    console.group("DPerf report");
    console.log("total store updates:", setCount);
    console.log("per action:", Object.fromEntries(perAction));
    console.log("field change counts (which fields churn most):");
    const sorted = [...fieldChangeCount.entries()].sort((a, b) => b[1] - a[1]);
    console.table(sorted.map(([k, v]) => ({ field: k, changes: v })));
    console.groupEnd();
  }

  // Stress scenarios
  async function stress(opts = {}) {
    const keystrokes = opts.keystrokes ?? 200;
    const tabSwitches = opts.tabSwitches ?? 20;
    const dirToggles = opts.dirToggles ?? 30;

    reset();
    console.log("=== keystroke storm (N=" + keystrokes + ") ===");
    tag("keystrokes", () => {
      const s = store.getState();
      const tabId = s.activeId;
      if (!tabId) return;
      let v = s.tabs.find((t) => t.id === tabId)?.content ?? "";
      for (let i = 0; i < keystrokes; i++) {
        v += "x";
        store.getState().setContent(v, tabId);
      }
    });

    console.log("=== rapid tab switch (N=" + tabSwitches + ") ===");
    tag("tabSwitches", () => {
      const ids = store.getState().tabs.map((t) => t.id);
      if (ids.length < 2) {
        console.warn("need ≥2 tabs to test switch");
        return;
      }
      for (let i = 0; i < tabSwitches; i++) {
        store.getState().setActive(ids[i % ids.length]);
      }
    });

    console.log("=== dir expand toggle (N=" + dirToggles + ") ===");
    tag("dirToggles", () => {
      const expanded = store.getState().expandedDirs;
      const paths = Object.keys(expanded);
      if (!paths.length) {
        console.warn("no expanded dirs yet; click a folder first");
        return;
      }
      for (let i = 0; i < dirToggles; i++) {
        const p = paths[i % paths.length];
        store.getState().setDirExpanded(p, !store.getState().expandedDirs[p]);
      }
    });

    report();
  }

  // Single keystroke timing — what does ONE keystroke cost?
  function oneKey() {
    reset();
    const s = store.getState();
    const tabId = s.activeId;
    const v = (s.tabs.find((t) => t.id === tabId)?.content ?? "") + "x";
    const t0 = performance.now();
    store.getState().setContent(v, tabId);
    // Force a microtask flush so React commits before we read
    return new Promise((resolve) =>
      requestAnimationFrame(() => {
        const dt = performance.now() - t0;
        console.log(`one keystroke commit: ${dt.toFixed(2)}ms`);
        report();
        resolve(dt);
      }),
    );
  }

  window.DPerf = { stress, oneKey, reset, report };
  console.log(
    "%cDPerf installed.%c\n" +
    "  DPerf.oneKey()   - measure one keystroke commit time\n" +
    "  DPerf.stress()   - run keystroke + tab + dir storms\n" +
    "  DPerf.report()   - print current counts",
    "color: #3574f0; font-weight: 600",
    "",
  );
})();
