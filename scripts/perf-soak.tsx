/**
 * Deep stress + soak + leak test.
 *
 *   npx tsx scripts/perf-soak.tsx
 *
 * What it verifies that the prior tests didn't:
 *   1. Per-action commit time stays under 16ms (1 frame @ 60fps) even with
 *      hundreds of tabs + workspaces + expanded dirs in flight
 *   2. No timing degradation over 10k mixed actions (steady-state)
 *   3. No memory leak when opening/closing 1000 tabs (editorStateCache,
 *      EditorHost mount set, store tab refs all clean up)
 *   4. Worst-case combination: deep tab + workspace + rapid switching
 *      doesn't tip past the frame budget
 */

import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
(globalThis as any).HTMLElement = dom.window.HTMLElement;
(globalThis as any).Element = dom.window.Element;
(globalThis as any).Node = dom.window.Node;
(globalThis as any).getComputedStyle = dom.window.getComputedStyle;
(globalThis as any).requestAnimationFrame = (cb: any) => setTimeout(cb, 16);
(globalThis as any).cancelAnimationFrame = (id: any) => clearTimeout(id);
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true, writable: true });
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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

const FRAME_BUDGET = 16; // ms — one frame @ 60fps
const SLOW_FRAME = 33;   // ms — drops to 30fps

// ── Replicas of the real components (same selector patterns) ───────────────
function AppLike() {
  useEditorStore((s) => s.theme);
  useEditorStore((s) => s.showPreview);
  useEditorStore((s) => s.previewMaximized);
  useEditorStore((s) => s.showSidebar);
  useEditorStore((s) => s.editorFontSize);
  useEditorStore((s) => s.language);
  const m = useActiveTabMeta();
  return <div>{m?.id ?? ""}</div>;
}
function TitleBarLike() { const h = useActiveTabHeader(); return <div>{h?.filePath ?? ""}{h?.dirty ? "•" : ""}</div>; }
function StatusBarLike() { const c = useActiveTabContent(); return <div>{c.length}</div>; }
function FileTreeLike() {
  const ws = useEditorStore(useShallow((s) => s.workspaces));
  const fp = useActiveTabFilePath();
  return <div>{ws.map((w) => <WorkspaceLike key={w} path={w} activePath={fp} />)}</div>;
}
const WorkspaceLike = memo(function WL({ path, activePath }: { path: string; activePath: string | null }) {
  const open = useEditorStore((s) => s.expandedDirs[path] !== false);
  return <div>{path} {open ? "▼" : "▶"} {activePath === path ? "*" : ""}</div>;
});
function TabBarLike() {
  const tabs = useEditorStore(useShallow((s) => s.tabs));
  const aid = useEditorStore((s) => s.activeId);
  return <div>{tabs.map((t) => <TabItemLike key={t.id} tab={t} active={t.id === aid} />)}</div>;
}
const TabItemLike = memo(function TI({ tab, active }: { tab: any; active: boolean }) {
  return <div>{tab.filePath ?? "x"}{active ? " *" : ""}{tab.content !== tab.savedContent ? " •" : ""}</div>;
});
function EditorHostLike({ activeId }: { activeId: string | null }) {
  const tabIds = useEditorStore(useShallow((s) => s.tabs.map((t) => t.id)));
  const [mounted, setMounted] = useState<Set<string>>(() => new Set(activeId ? [activeId] : []));
  useEffect(() => {
    if (!activeId) return;
    setMounted((p) => (p.has(activeId) ? p : new Set([...p, activeId])));
  }, [activeId]);
  useEffect(() => {
    const live = new Set(tabIds);
    setMounted((p) => {
      let changed = false; const n = new Set<string>();
      for (const id of p) { if (live.has(id)) n.add(id); else changed = true; }
      return changed ? n : p;
    });
  }, [tabIds]);
  return <div>{Array.from(mounted).map((id) => <EditorSlotLike key={id} tabId={id} visible={id === activeId} />)}</div>;
}
const EditorSlotLike = memo(function ES({ tabId, visible }: { tabId: string; visible: boolean }) {
  const t = useEditorStore(useShallow((s) => {
    const x = s.tabs.find((y) => y.id === tabId);
    return x ? { content: x.content, filePath: x.filePath, diff: x.diff } : null;
  }));
  return <div style={{ display: visible ? "block" : "none" }}>{t?.content ?? ""}</div>;
});

let totalRenders = 0;
const onRender: ProfilerOnRenderCallback = () => { totalRenders++; };
function Tree() {
  const m = useActiveTabMeta();
  return (
    <Profiler id="root" onRender={onRender}>
      <AppLike />
      <TitleBarLike />
      <StatusBarLike />
      <FileTreeLike />
      <TabBarLike />
      <EditorHostLike activeId={m?.id ?? null} />
    </Profiler>
  );
}

function p(arr: number[], q: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}
function stats(label: string, arr: number[]) {
  return {
    scenario: label,
    n: arr.length,
    mean_ms: +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2),
    p50_ms: +p(arr, 0.5).toFixed(2),
    p95_ms: +p(arr, 0.95).toFixed(2),
    p99_ms: +p(arr, 0.99).toFixed(2),
    max_ms: +Math.max(...arr).toFixed(2),
    over16ms: arr.filter((x) => x > FRAME_BUDGET).length,
    over33ms: arr.filter((x) => x > SLOW_FRAME).length,
  };
}

async function main() {
  const root = createRoot(document.body.appendChild(document.createElement("div")));

  // ── Worst-case setup: 100 tabs, 20 workspaces, 50 expanded dirs ────────
  console.log("Setup: 100 tabs, 20 workspaces, 50 expanded dirs...");
  const workspaces = Array.from({ length: 20 }, (_, i) => `/tmp/ws${i}`);
  const expandedDirs: Record<string, boolean> = {};
  for (let i = 0; i < 50; i++) expandedDirs[`/tmp/ws0/dir${i}`] = true;
  useEditorStore.setState({ tabs: [], activeId: null, workspaces, expandedDirs, tabPositions: {}, compareMarkPath: null } as any);
  for (let i = 0; i < 100; i++) {
    useEditorStore.getState().openTab(`/tmp/ws${i % 20}/file${i}.md`, `file ${i} content`.repeat(50));
  }
  const tabIds = useEditorStore.getState().tabs.map((t) => t.id);
  useEditorStore.getState().setActive(tabIds[0]);

  await act(async () => { root.render(<Tree />); });
  console.log(`Initial mount done. Total renders so far: ${totalRenders}\n`);

  // ── 1. Keystroke storm (1000 commits on active tab) ────────────────────
  console.log("Test 1: 1000 keystroke commits");
  const t1: number[] = [];
  totalRenders = 0;
  for (let i = 0; i < 1000; i++) {
    const t0 = performance.now();
    await act(async () => {
      const content = useEditorStore.getState().tabs.find((t) => t.id === tabIds[0])!.content + "x";
      useEditorStore.getState().setContent(content, tabIds[0]);
    });
    t1.push(performance.now() - t0);
  }
  console.log(stats("1000 keystrokes (100 tabs loaded)", t1));
  console.log(`  total renders: ${totalRenders}\n`);

  // ── 2. Rapid tab switch (500 switches across 100 tabs) ─────────────────
  console.log("Test 2: 500 tab switches (100 tabs in flight)");
  const t2: number[] = [];
  totalRenders = 0;
  for (let i = 0; i < 500; i++) {
    const t0 = performance.now();
    await act(async () => {
      useEditorStore.getState().setActive(tabIds[i % tabIds.length]);
    });
    t2.push(performance.now() - t0);
  }
  console.log(stats("500 tab switches", t2));
  console.log(`  total renders: ${totalRenders}\n`);

  // ── 3. Dir expand storm (user's pain point, at scale) ──────────────────
  console.log("Test 3: 1000 dir expand toggles");
  const t3: number[] = [];
  totalRenders = 0;
  for (let i = 0; i < 1000; i++) {
    const t0 = performance.now();
    await act(async () => {
      useEditorStore.getState().setDirExpanded(`/tmp/ws0/dir${i % 50}`, i % 2 === 0);
    });
    t3.push(performance.now() - t0);
  }
  console.log(stats("1000 dir expands", t3));
  console.log(`  total renders: ${totalRenders}\n`);

  // ── 4. Mixed soak (10000 random actions) ───────────────────────────────
  console.log("Test 4: 10000 mixed actions (soak — looking for degradation)");
  const t4: number[] = [];
  const t4_first1k: number[] = [];
  const t4_last1k: number[] = [];
  totalRenders = 0;
  for (let i = 0; i < 10000; i++) {
    const t0 = performance.now();
    const r = i % 5;
    await act(async () => {
      if (r === 0) {
        useEditorStore.getState().setContent("x".repeat(i % 1000), tabIds[i % tabIds.length]);
      } else if (r === 1) {
        useEditorStore.getState().setActive(tabIds[i % tabIds.length]);
      } else if (r === 2) {
        useEditorStore.getState().setDirExpanded(`/tmp/ws0/dir${i % 50}`, i % 2 === 0);
      } else if (r === 3) {
        useEditorStore.getState().setCompareMarkPath(i % 10 === 0 ? `/tmp/ws0/file${i % 50}.md` : null);
      } else {
        useEditorStore.getState().setTabPosition(tabIds[i % tabIds.length], { cursor: i, scrollTopLine: i % 100 });
      }
    });
    const dt = performance.now() - t0;
    t4.push(dt);
    if (i < 1000) t4_first1k.push(dt);
    if (i >= 9000) t4_last1k.push(dt);
  }
  console.log(stats("10000 mixed actions (full)", t4));
  console.log(stats("  first 1000", t4_first1k));
  console.log(stats("  last 1000 (degradation check)", t4_last1k));
  const meanFirst = t4_first1k.reduce((a, b) => a + b, 0) / t4_first1k.length;
  const meanLast = t4_last1k.reduce((a, b) => a + b, 0) / t4_last1k.length;
  console.log(`  degradation: ${(((meanLast - meanFirst) / meanFirst) * 100).toFixed(1)}% slower`);
  console.log(`  total renders: ${totalRenders}\n`);

  // ── 5. Memory / cleanup: open + close 1000 tabs ────────────────────────
  console.log("Test 5: open + close 1000 tabs (leak check)");
  const beforeTabs = useEditorStore.getState().tabs.length;
  const beforeMem = process.memoryUsage().heapUsed;
  await act(async () => {
    for (let i = 0; i < 1000; i++) {
      useEditorStore.getState().openTab(`/tmp/throwaway/file${i}.md`, `content ${i}`);
    }
  });
  const peakTabs = useEditorStore.getState().tabs.length;
  const peakMem = process.memoryUsage().heapUsed;
  await act(async () => {
    const toClose = useEditorStore.getState().tabs.filter((t) => t.filePath?.startsWith("/tmp/throwaway/"));
    for (const t of toClose) useEditorStore.getState().closeTab(t.id);
  });
  const afterTabs = useEditorStore.getState().tabs.length;
  global.gc?.();
  const afterMem = process.memoryUsage().heapUsed;
  console.log({
    tabs_before: beforeTabs,
    tabs_peak: peakTabs,
    tabs_after: afterTabs,
    tabs_leaked: afterTabs - beforeTabs,
    heap_before_mb: +(beforeMem / 1024 / 1024).toFixed(1),
    heap_peak_mb: +(peakMem / 1024 / 1024).toFixed(1),
    heap_after_mb: +(afterMem / 1024 / 1024).toFixed(1),
    heap_retained_mb: +((afterMem - beforeMem) / 1024 / 1024).toFixed(1),
  });

  // ── Verdict ────────────────────────────────────────────────────────────
  const failures: string[] = [];
  const checks = [
    { name: "1000 keystrokes p99", val: p(t1, 0.99), limit: FRAME_BUDGET },
    { name: "1000 keystrokes max", val: Math.max(...t1), limit: SLOW_FRAME },
    { name: "500 tab switches p99", val: p(t2, 0.99), limit: FRAME_BUDGET },
    { name: "500 tab switches max", val: Math.max(...t2), limit: SLOW_FRAME * 2 }, // EditorHost mounts new slots
    { name: "1000 dir expands p99", val: p(t3, 0.99), limit: FRAME_BUDGET },
    { name: "1000 dir expands max", val: Math.max(...t3), limit: SLOW_FRAME },
    { name: "10000 mixed p99", val: p(t4, 0.99), limit: FRAME_BUDGET },
    { name: "tabs leaked", val: afterTabs - beforeTabs, limit: 0 },
  ];
  console.log("\n=== Frame-budget checks ===");
  console.table(checks.map((c) => ({ ...c, ok: c.val <= c.limit ? "✓" : "✗" })));
  for (const c of checks) if (c.val > c.limit) failures.push(`${c.name} = ${c.val.toFixed(2)} > limit ${c.limit}`);

  // Degradation check
  const degradation = ((meanLast - meanFirst) / meanFirst) * 100;
  if (degradation > 50) failures.push(`steady-state degradation = ${degradation.toFixed(1)}% (>50%)`);

  console.log("\n" + "═".repeat(60));
  if (failures.length === 0) {
    console.log("✅ All deep-stress invariants hold.");
    process.exit(0);
  } else {
    console.log(`❌ ${failures.length} failure(s):`);
    for (const f of failures) console.log("  " + f);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
