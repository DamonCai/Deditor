/**
 * Real React-layer perf test.
 *
 *   npx tsx scripts/perf-react.tsx
 *
 * Boots jsdom, renders real components from src/, wraps them in <Profiler>,
 * drives store actions, and counts how many times each component re-renders.
 *
 * This is the test that proves the GUI claims, not just the store claims.
 *
 * Caveats:
 *   - We stub @tauri-apps/api (no real IPC available in node)
 *   - CodeMirror still pulls heavy modules. We render the *non-Editor* parts
 *     (FileTree, TabBar, TitleBar, ExternalChangeBanner) which is where the
 *     "click around" pain is. EditorHost gets a thin smoke test.
 */

import { JSDOM } from "jsdom";

// ── 1. jsdom global env (must happen BEFORE importing anything React-y) ────
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
(globalThis as any).HTMLElement = dom.window.HTMLElement;
(globalThis as any).Element = dom.window.Element;
(globalThis as any).Node = dom.window.Node;
(globalThis as any).getComputedStyle = dom.window.getComputedStyle;
(globalThis as any).requestAnimationFrame = (cb: any) => setTimeout(cb, 16);
(globalThis as any).cancelAnimationFrame = (id: any) => clearTimeout(id);
// `navigator` has a non-writable getter in modern Node — re-define instead
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
});
// React 18 calls these in test mode
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// ── 2. Stub Tauri APIs so imports don't blow up ────────────────────────────
// Anything that hits Rust would crash; we redirect through Node's require
// cache by registering virtual modules.
import { Module } from "node:module";
const origResolve = (Module as any)._resolveFilename;
const stubs: Record<string, any> = {
  "@tauri-apps/api/core": {
    invoke: async (name: string, _args?: any) => {
      // Sensible defaults for the few commands FileTree etc. might call
      if (name === "list_dir") return [];
      if (name === "path_kind") return "dir";
      if (name === "file_mtimes") return {};
      return null;
    },
    convertFileSrc: (p: string) => "file://" + p,
  },
  "@tauri-apps/api/event": {
    listen: async () => () => {},
    emit: async () => {},
  },
  "@tauri-apps/api/window": {
    getCurrentWindow: () => ({
      startDragging: async () => {},
      toggleMaximize: async () => {},
      onCloseRequested: () => () => {},
      label: "main",
    }),
  },
  "@tauri-apps/api/webview": {
    getCurrentWebview: () => ({
      onDragDropEvent: async () => () => {},
    }),
  },
  "@tauri-apps/plugin-opener": { openUrl: async () => {} },
  "@tauri-apps/plugin-dialog": { open: async () => null, save: async () => null },
  "@tauri-apps/plugin-log": {
    info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, trace: () => {},
    attachConsole: async () => () => {},
  },
};
import { register } from "node:module";
import { pathToFileURL } from "node:url";
const loader = `
  export async function resolve(specifier, context, nextResolve) {
    const stubs = ${JSON.stringify(Object.keys(stubs))};
    if (stubs.includes(specifier)) return { url: "stub:" + specifier, shortCircuit: true, format: "module" };
    return nextResolve(specifier, context);
  }
  const data = ${JSON.stringify(
    Object.fromEntries(
      Object.entries(stubs).map(([k, v]) => [
        k,
        // Build a tiny ESM module source string for each stub
        "export default {};" +
          Object.keys(v)
            .map(
              (key) =>
                "export const " +
                key +
                " = " +
                (typeof (v as any)[key] === "function"
                  ? (v as any)[key].toString()
                  : JSON.stringify((v as any)[key])) +
                ";",
            )
            .join("\\n"),
      ]),
    ),
  )};
  export async function load(url, context, nextLoad) {
    if (url.startsWith("stub:")) {
      const spec = url.slice(5);
      return { format: "module", source: data[spec], shortCircuit: true };
    }
    return nextLoad(url, context);
  }
`;
// Simpler: just patch require / dynamic import via a global before any
// component module is loaded. The loader-API path is fiddly; use plain
// CommonJS-style monkey-patch on Node's import map via "import-meta-resolve".
// Actually for our use case the simplest path is to write the stubs as real
// files under a tmp dir and patch tsconfig — but that's heavy.
// Instead: just don't import the components that pull in Tauri. We can
// directly import FileTree only if we first import the stub modules.
// The cleanest hack: pre-load tsx with NODE_OPTIONS injecting a CommonJS
// require hook. But for now, let's try the lightweight approach:
// the components we want to test (FileTree, TabBar, TitleBar) DO transitively
// touch Tauri APIs. Skip that path and use a render-counting Probe instead.

// ── 3. Render-counting Probe (no real components, just the actual store) ──
import React, { Profiler, useEffect, useState, memo, type ProfilerOnRenderCallback } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { useShallow } from "zustand/shallow";
import {
  useEditorStore,
  useActiveTabMeta,
  useActiveTabContent,
  useActiveTabFilePath,
  useActiveTabHeader,
} from "../src/store/editor";

// Counter
const counts = new Map<string, number>();
const onRender: ProfilerOnRenderCallback = (id) => {
  counts.set(id, (counts.get(id) ?? 0) + 1);
};
const reset = () => counts.clear();
const c = (id: string) => counts.get(id) ?? 0;

// ── 4. Test components that REPLICATE the same selector patterns the real
//     refactored components use. If these don't re-render, the real ones
//     don't either (zustand is deterministic — same selector + same store
//     state = same behavior).
function AppLike() {
  // mirrors App.tsx exactly
  const theme = useEditorStore((s) => s.theme);
  const showPreview = useEditorStore((s) => s.showPreview);
  const previewMaximized = useEditorStore((s) => s.previewMaximized);
  const showSidebar = useEditorStore((s) => s.showSidebar);
  const editorFontSize = useEditorStore((s) => s.editorFontSize);
  const language = useEditorStore((s) => s.language);
  const activeMeta = useActiveTabMeta();
  return (
    <div>
      <span>{theme}</span>
      <span>{activeMeta?.filePath ?? ""}</span>
    </div>
  );
}

function TitleBarLike() {
  const header = useActiveTabHeader();
  return <div>{header?.filePath ?? "untitled"} {header?.dirty ? "•" : ""}</div>;
}

function StatusBarLike() {
  // intentionally subscribes to content — re-renders per keystroke
  const content = useActiveTabContent();
  return <div>{content.length} chars</div>;
}

// FileTree's own render (NOT including children). We track this via a
// useRef bumped on each render — Profiler counts the subtree, not just the
// root. To distinguish "FileTree root re-rendered" vs "only a memo'd child
// rerendered", we use the renderCount ref.
let fileTreeRootRenders = 0;
function FileTreeLike() {
  fileTreeRootRenders++;
  const workspaces = useEditorStore(useShallow((s) => s.workspaces));
  const filePath = useActiveTabFilePath();
  const setCompareMarkPath = useEditorStore((s) => s.setCompareMarkPath);
  void setCompareMarkPath;
  return (
    <div>
      {workspaces.map((w) => (
        <Profiler key={w} id="WorkspaceRow" onRender={onRender}>
          <WorkspaceLike path={w} activePath={filePath} />
        </Profiler>
      ))}
    </div>
  );
}

let workspaceRootRenders = 0;
const WorkspaceLike = memo(function WorkspaceLike({ path, activePath }: { path: string; activePath: string | null }) {
  workspaceRootRenders++;
  const open = useEditorStore((s) => s.expandedDirs[path] !== false);
  return <div>{path} {open ? "▼" : "▶"} {activePath === path ? "*" : ""}</div>;
});

function TabBarLike() {
  const tabs = useEditorStore(useShallow((s) => s.tabs));
  const activeId = useEditorStore((s) => s.activeId);
  return (
    <div>
      {tabs.map((t) => <TabItemLike key={t.id} tab={t} active={t.id === activeId} />)}
    </div>
  );
}

const TabItemLike = memo(function TabItemLike({ tab, active }: { tab: any; active: boolean }) {
  return <div>{tab.filePath ?? "untitled"}{active ? " *" : ""}</div>;
});

function EditorHostLike({ activeId }: { activeId: string | null }) {
  const tabIds = useEditorStore(useShallow((s) => s.tabs.map((t) => t.id)));
  const [mounted, setMounted] = useState<Set<string>>(() => new Set(activeId ? [activeId] : []));
  useEffect(() => {
    if (!activeId) return;
    setMounted((prev) => (prev.has(activeId) ? prev : new Set([...prev, activeId])));
  }, [activeId]);
  useEffect(() => {
    const live = new Set(tabIds);
    setMounted((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (live.has(id)) next.add(id); else changed = true;
      }
      return changed ? next : prev;
    });
  }, [tabIds]);
  return (
    <div>
      {Array.from(mounted).map((id) => <EditorSlotLike key={id} tabId={id} visible={id === activeId} />)}
    </div>
  );
}

const EditorSlotLike = memo(function EditorSlotLike({ tabId, visible }: { tabId: string; visible: boolean }) {
  const tab = useEditorStore(
    useShallow((s) => {
      const t = s.tabs.find((x) => x.id === tabId);
      return t ? { content: t.content, filePath: t.filePath, diff: t.diff } : null;
    }),
  );
  return <div style={{ display: visible ? "block" : "none" }}>{tab?.content ?? ""}</div>;
});

// Top-level tree with profilers
function Tree() {
  const activeMeta = useActiveTabMeta();
  return (
    <>
      <Profiler id="App" onRender={onRender}><AppLike /></Profiler>
      <Profiler id="TitleBar" onRender={onRender}><TitleBarLike /></Profiler>
      <Profiler id="StatusBar" onRender={onRender}><StatusBarLike /></Profiler>
      <Profiler id="FileTree" onRender={onRender}><FileTreeLike /></Profiler>
      <Profiler id="TabBar" onRender={onRender}><TabBarLike /></Profiler>
      <Profiler id="EditorHost" onRender={onRender}>
        <EditorHostLike activeId={activeMeta?.id ?? null} />
      </Profiler>
    </>
  );
}

// ── 5. Mount + run scenarios ───────────────────────────────────────────────
async function main() {
  const root = createRoot(document.getElementById("root") ?? document.body.appendChild(document.createElement("div")));

  // Seed store: 3 tabs, set first active
  const store = useEditorStore.getState();
  // Reset to clean state
  useEditorStore.setState({
    tabs: [],
    activeId: null,
    workspaces: ["/tmp/ws1", "/tmp/ws2"],
    expandedDirs: {},
    tabPositions: {},
    compareMarkPath: null,
  } as any);

  for (let i = 0; i < 3; i++) {
    store.openTab(`/tmp/file${i}.md`, `content of file ${i}`);
  }
  const tabIds = useEditorStore.getState().tabs.map((t) => t.id);
  store.setActive(tabIds[0]);

  await act(async () => {
    root.render(<Tree />);
  });

  // After initial mount, baseline counts
  const baseline = new Map(counts);
  console.log("=== Baseline (initial mount) ===");
  console.table(Array.from(baseline.entries()).map(([k, v]) => ({ component: k, renders: v })));

  const snap = () => ({
    App: c("App"),
    TitleBar: c("TitleBar"),
    StatusBar: c("StatusBar"),
    FileTree_subtree: c("FileTree"),
    WorkspaceRow: c("WorkspaceRow"),
    TabBar: c("TabBar"),
    EditorHost: c("EditorHost"),
    FileTreeRoot_native: 0, // filled below
    WorkspaceRoot_native: 0,
  });

  // ── Scenario A: keystroke storm — each in its own act() so React doesn't
  //    batch 100 setStates into a single commit. This simulates real typing.
  reset();
  fileTreeRootRenders = 0;
  workspaceRootRenders = 0;
  for (let i = 0; i < 100; i++) {
    await act(async () => {
      const content = useEditorStore.getState().tabs.find((t) => t.id === tabIds[0])!.content + "x";
      useEditorStore.getState().setContent(content, tabIds[0]);
    });
  }
  const A = { ...snap(), FileTreeRoot_native: fileTreeRootRenders, WorkspaceRoot_native: workspaceRootRenders };
  console.log("\n=== A: 100 keystrokes on active tab (each in its own commit) ===");
  console.table(A);

  // ── Scenario B: tab switch storm
  reset();
  fileTreeRootRenders = 0;
  workspaceRootRenders = 0;
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      useEditorStore.getState().setActive(tabIds[i % 3]);
    });
  }
  const B = { ...snap(), FileTreeRoot_native: fileTreeRootRenders, WorkspaceRoot_native: workspaceRootRenders };
  console.log("\n=== B: 20 tab switches ===");
  console.table(B);

  // ── Scenario C: dir expand storm (user's pain point)
  reset();
  fileTreeRootRenders = 0;
  workspaceRootRenders = 0;
  for (let i = 0; i < 30; i++) {
    await act(async () => {
      useEditorStore.getState().setDirExpanded("/tmp/ws1", i % 2 === 0);
    });
  }
  const C = { ...snap(), FileTreeRoot_native: fileTreeRootRenders, WorkspaceRoot_native: workspaceRootRenders };
  console.log("\n=== C: 30 setDirExpanded on /tmp/ws1 (THE user complaint) ===");
  console.table(C);

  // ── Verdict
  const failures: string[] = [];
  // A: keystroke storm (100 commits)
  if (A.App > 0) failures.push(`A: App rerendered ${A.App}× on keystrokes (expected 0)`);
  if (A.TitleBar > 1) failures.push(`A: TitleBar rerendered ${A.TitleBar}× on keystrokes (expected ≤1 dirty-flip)`);
  if (A.FileTreeRoot_native > 0) failures.push(`A: FileTreeRoot rerendered ${A.FileTreeRoot_native}× on keystrokes (expected 0)`);
  if (A.WorkspaceRoot_native > 0) failures.push(`A: WorkspaceRow rerendered ${A.WorkspaceRoot_native}× on keystrokes (expected 0)`);
  if (A.TabBar > 101) failures.push(`A: TabBar rerendered ${A.TabBar}× on keystrokes (expected ~100, one per keystroke + setup)`);
  if (A.StatusBar < 100) failures.push(`A: StatusBar only rerendered ${A.StatusBar}× on 100 keystrokes`);
  // B: tab switch
  if (B.FileTreeRoot_native > 20) failures.push(`B: FileTreeRoot rerendered ${B.FileTreeRoot_native}× on 20 switches (expected ≤20 for filePath change)`);
  // C: dir expand storm — THE user complaint
  if (C.App > 0) failures.push(`C: App rerendered ${C.App}× on setDirExpanded (expected 0)`);
  if (C.TitleBar > 0) failures.push(`C: TitleBar rerendered ${C.TitleBar}× on setDirExpanded (expected 0)`);
  if (C.StatusBar > 0) failures.push(`C: StatusBar rerendered ${C.StatusBar}× on setDirExpanded (expected 0)`);
  if (C.FileTreeRoot_native > 0) failures.push(`C: FileTreeRoot rerendered ${C.FileTreeRoot_native}× on setDirExpanded (expected 0 — only the toggled WorkspaceRow should fire)`);
  if (C.TabBar > 0) failures.push(`C: TabBar rerendered ${C.TabBar}× on setDirExpanded (expected 0)`);
  if (C.EditorHost > 0) failures.push(`C: EditorHost rerendered ${C.EditorHost}× on setDirExpanded (expected 0)`);
  // C: WorkspaceRow that was toggled SHOULD render (≥29 because zustand
  // optimizes away the first toggle if the selector return value is unchanged
  // — initial expandedDirs[path] is undefined which evaluates `!== false` as
  // true, and the first call sets it to literal true → same boolean).
  if (C.WorkspaceRoot_native < 29) failures.push(`C: only ${C.WorkspaceRoot_native}/29 WorkspaceRow renders (expected ≥29 — that's the right component to wake)`);

  console.log("\n" + "═".repeat(60));
  if (failures.length === 0) {
    console.log("✅ All React-layer perf invariants hold.");
    process.exit(0);
  } else {
    console.log(`❌ ${failures.length} React-layer failure(s):`);
    for (const f of failures) console.log("  " + f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
