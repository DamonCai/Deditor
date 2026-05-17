/**
 * Headless behavioral test for the store-level perf fixes.
 *
 *   npx tsx scripts/perf-test.ts
 *
 * Tests we actually want to verify:
 *   1. setContent on the active tab does NOT change unrelated tabs' refs
 *   2. useShallow-style selectors return the SAME object when fields are
 *      unchanged (i.e. App.tsx's activeMeta won't fire on keystroke)
 *   3. The lean per-field selectors (filePath, id, etc.) don't change on
 *      keystroke
 *   4. A keystroke fires content subscribers but NOT meta / id / filePath
 *      subscribers
 *
 * This is the load-bearing claim of the whole refactor; if any of these
 * fail, the GUI perf claims are false.
 */

import { useEditorStore } from "../src/store/editor";

// Disable React-flavored bits — we only need the vanilla store API.
const store = useEditorStore;

function shallowEqual(a: any, b: any): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.is(a[k], b[k])) return false;
  return true;
}

// Manual selector instrumentation: count how many times the selected slice
// changes (object identity), and how many times it would be "shallow-equal"
// to the previous (which is what useShallow makes useEditorStore use to skip
// re-renders).
function track<T>(name: string, selector: (s: any) => T) {
  let last = selector(store.getState());
  let identityChanges = 0;
  let shallowChanges = 0;
  let calls = 0;
  store.subscribe((s) => {
    const v = selector(s);
    calls++;
    if (!Object.is(v, last)) identityChanges++;
    if (!shallowEqual(v, last)) shallowChanges++;
    last = v;
  });
  return {
    name,
    report: () => ({
      name,
      calls,
      identityChanges,
      shallowChanges,
      // The actual number of times a useShallow-wrapped useEditorStore would
      // re-render its consumer:
      memoEffectiveRenders: shallowChanges,
    }),
  };
}

// ── Setup ──────────────────────────────────────────────────────────────────
console.log("Setting up: 5 tabs, active = #2");
store.getState().closeOthers; // ensure store is real
const s = store.getState();
// Open 5 tabs via the real store API.
for (let i = 0; i < 5; i++) s.openTab(`/tmp/file${i}.md`, `content of file ${i}`);
// activate the 3rd tab
const tabIds = store.getState().tabs.map((t) => t.id);
store.getState().setActive(tabIds[2]);
const activeTabId = tabIds[2];

console.log(`tabs=${tabIds.length} activeId=${activeTabId.slice(0, 8)}…\n`);

// ── Wire up trackers (one per selector the refactor relies on) ─────────────
const trackers = [
  track("activeId (primitive)", (s) => s.activeId),
  track("activeTab.content (intentional re-render)", (s) =>
    s.tabs.find((t: any) => t.id === s.activeId)?.content ?? "",
  ),
  track("activeTab.filePath (lean)", (s) =>
    s.tabs.find((t: any) => t.id === s.activeId)?.filePath ?? null,
  ),
  track("activeTab meta {id, filePath, isDiff, hasExternalChange}", (s) => {
    const t = s.tabs.find((x: any) => x.id === s.activeId);
    if (!t) return null;
    return {
      id: t.id,
      filePath: t.filePath,
      isDiff: !!t.diff,
      hasExternalChange: t.externalChange != null,
    };
  }),
  track("activeTab header {filePath, dirty}", (s) => {
    const t = s.tabs.find((x: any) => x.id === s.activeId);
    if (!t) return null;
    return { filePath: t.filePath, dirty: t.content !== t.savedContent };
  }),
  track("tabs (array ref)", (s) => s.tabs),
  track("tabs.map(t.id) (id list)", (s) => s.tabs.map((t: any) => t.id)),
  track("workspaces", (s) => s.workspaces),
  track("expandedDirs", (s) => s.expandedDirs),
  // Per-tab-content selector (what EditorSlot subscribes to for a NON-ACTIVE tab):
  track("OTHER tab content (inactive #0)", (s) =>
    s.tabs.find((t: any) => t.id === tabIds[0])?.content ?? "",
  ),
];

// ── Scenario A: 200 keystrokes on active tab ───────────────────────────────
console.log("Scenario A: 200 setContent() on active tab\n");
let v = store.getState().tabs.find((t) => t.id === activeTabId)!.content;
for (let i = 0; i < 200; i++) {
  v += "x";
  store.getState().setContent(v, activeTabId);
}

console.log("After 200 keystrokes:");
console.table(trackers.map((t) => t.report()));

// Hard assertions
const A = Object.fromEntries(trackers.map((t) => [t.name, t.report()]));
const failures: string[] = [];

if (A["activeId (primitive)"].memoEffectiveRenders !== 0) {
  failures.push(
    `❌ activeId should NEVER change on keystroke, got ${A["activeId (primitive)"].memoEffectiveRenders}`,
  );
}
if (A["activeTab.filePath (lean)"].memoEffectiveRenders !== 0) {
  failures.push(
    `❌ filePath selector should NEVER change on keystroke (got ${A["activeTab.filePath (lean)"].memoEffectiveRenders})`,
  );
}
if (
  A["activeTab meta {id, filePath, isDiff, hasExternalChange}"]
    .memoEffectiveRenders !== 0
) {
  failures.push(
    `❌ meta selector should be shallow-equal across keystrokes (got ${A["activeTab meta {id, filePath, isDiff, hasExternalChange}"].memoEffectiveRenders})`,
  );
}
if (A["activeTab header {filePath, dirty}"].memoEffectiveRenders !== 1) {
  // The very first keystroke flips dirty false→true. After that no more.
  failures.push(
    `❌ header should flip dirty exactly once on the first keystroke (got ${A["activeTab header {filePath, dirty}"].memoEffectiveRenders})`,
  );
}
if (A["activeTab.content (intentional re-render)"].memoEffectiveRenders !== 200) {
  failures.push(
    `❌ content selector should fire on each keystroke (got ${A["activeTab.content (intentional re-render)"].memoEffectiveRenders}/200)`,
  );
}
if (A["OTHER tab content (inactive #0)"].memoEffectiveRenders !== 0) {
  failures.push(
    `❌ a tab that's NOT being typed in must not re-render (got ${A["OTHER tab content (inactive #0)"].memoEffectiveRenders})`,
  );
}
if (A["workspaces"].memoEffectiveRenders !== 0) {
  failures.push(
    `❌ workspaces should never change on keystroke (got ${A["workspaces"].memoEffectiveRenders})`,
  );
}
if (A["expandedDirs"].memoEffectiveRenders !== 0) {
  failures.push(
    `❌ expandedDirs should never change on keystroke (got ${A["expandedDirs"].memoEffectiveRenders})`,
  );
}
// id list — useShallow on tabs.map(t => t.id): 200 keystrokes shouldn't add/remove tabs
if (A["tabs.map(t.id) (id list)"].memoEffectiveRenders !== 0) {
  failures.push(
    `❌ id list (used by EditorHost) should be shallow-equal across keystrokes (got ${A["tabs.map(t.id) (id list)"].memoEffectiveRenders})`,
  );
}

// ── Scenario B: 20 tab switches (no typing) ────────────────────────────────
trackers.forEach((t) => {
  // reset counters by re-tracking — easiest is to just spawn new trackers
});
console.log("\nScenario B: 20 setActive() back-and-forth\n");
const beforeB = Object.fromEntries(
  trackers.map((t) => [t.name, t.report().memoEffectiveRenders]),
);
for (let i = 0; i < 20; i++) {
  store.getState().setActive(tabIds[i % tabIds.length]);
}
const afterB = Object.fromEntries(
  trackers.map((t) => [t.name, t.report().memoEffectiveRenders]),
);
const deltaB = Object.fromEntries(
  Object.keys(afterB).map((k) => [k, afterB[k] - beforeB[k]]),
);
console.table(
  Object.entries(deltaB).map(([k, v]) => ({ selector: k, "Δ memoRenders": v })),
);

// On 20 setActive, content/filePath/meta/etc all SHOULD change (different tab).
// But workspaces / expandedDirs should NOT.
if (deltaB["workspaces"] !== 0) {
  failures.push(
    `❌ workspaces must not change on setActive (got ${deltaB["workspaces"]})`,
  );
}
if (deltaB["expandedDirs"] !== 0) {
  failures.push(
    `❌ expandedDirs must not change on setActive (got ${deltaB["expandedDirs"]})`,
  );
}

// ── Scenario C: dir expand storm (the user's specific complaint) ───────────
console.log("\nScenario C: 50 setDirExpanded() on a single dir\n");
const beforeC = Object.fromEntries(
  trackers.map((t) => [t.name, t.report().memoEffectiveRenders]),
);
const dir = "/tmp/somefolder";
for (let i = 0; i < 50; i++) {
  store.getState().setDirExpanded(dir, i % 2 === 0);
}
const afterC = Object.fromEntries(
  trackers.map((t) => [t.name, t.report().memoEffectiveRenders]),
);
const deltaC = Object.fromEntries(
  Object.keys(afterC).map((k) => [k, afterC[k] - beforeC[k]]),
);
console.table(
  Object.entries(deltaC).map(([k, v]) => ({ selector: k, "Δ memoRenders": v })),
);
// expandedDirs SHOULD fire 50 times. Everything else should be 0.
if (deltaC["expandedDirs"] !== 50) {
  failures.push(
    `❌ expandedDirs should fire exactly 50× on 50 toggles (got ${deltaC["expandedDirs"]})`,
  );
}
for (const k of [
  "activeId (primitive)",
  "activeTab.content (intentional re-render)",
  "activeTab.filePath (lean)",
  "activeTab meta {id, filePath, isDiff, hasExternalChange}",
  "tabs (array ref)",
  "tabs.map(t.id) (id list)",
  "workspaces",
]) {
  if (deltaC[k] !== 0) {
    failures.push(
      `❌ ${k} must NOT fire when only expandedDirs changes (got ${deltaC[k]})`,
    );
  }
}

// ── Verdict ────────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(60));
if (failures.length === 0) {
  console.log("✅ All store-level perf invariants hold.");
  process.exit(0);
} else {
  console.log(`❌ ${failures.length} failure(s):`);
  for (const f of failures) console.log("  " + f);
  process.exit(1);
}
