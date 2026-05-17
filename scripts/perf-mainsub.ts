/**
 * Verify the main.tsx cache-prune subscriber doesn't do per-keystroke work.
 *
 *   npx tsx scripts/perf-mainsub.ts
 *
 * Before fix: subscriber ran on EVERY store change. setContent (keystroke)
 *   → tabs.map produces new array → subscriber thinks "tabs changed" →
 *   allocates new Set, walks every old id checking membership. O(N) per key.
 * After fix:  cheap structural check (length + first/last id) lets the
 *   keystroke path return early in O(1) without allocations.
 *
 * We instrument both variants by injecting them as plain subscribers and
 * counting how many times the *expensive branch* (the Set walk) runs.
 */
import { createStore } from "zustand/vanilla";

interface Tab { id: string; content: string }
interface State { tabs: Tab[]; setContent: (id: string, c: string) => void; openTab: (t: Tab) => void; closeTab: (id: string) => void }

function makeStore() {
  return createStore<State>((set, get) => ({
    tabs: [],
    setContent: (id, content) => set({ tabs: get().tabs.map(t => t.id === id ? { ...t, content } : t) }),
    openTab: (t) => set({ tabs: [...get().tabs, t] }),
    closeTab: (id) => set({ tabs: get().tabs.filter(t => t.id !== id) }),
  }));
}

function attachOldSubscriber(store: ReturnType<typeof makeStore>) {
  let knownIds = new Set(store.getState().tabs.map(t => t.id));
  let expensiveRuns = 0;
  const unsub = store.subscribe((s) => {
    expensiveRuns++;
    const cur = new Set(s.tabs.map(t => t.id));
    for (const id of knownIds) {
      if (!cur.has(id)) { /* drop */ }
    }
    knownIds = cur;
  });
  return { unsub, expensiveRuns: () => expensiveRuns };
}

function attachNewSubscriber(store: ReturnType<typeof makeStore>) {
  let expensiveRuns = 0;
  const unsub = store.subscribe((next: any, prev: any) => {
    if (next.tabs === prev.tabs) return;
    const a = next.tabs, b = prev.tabs;
    if (
      a.length === b.length &&
      a[0]?.id === b[0]?.id &&
      a[a.length - 1]?.id === b[b.length - 1]?.id
    ) {
      return;
    }
    expensiveRuns++;
    const liveIds = new Set<string>();
    for (const t of a) liveIds.add(t.id);
    for (const t of b) {
      if (!liveIds.has(t.id)) { /* drop */ }
    }
  });
  return { unsub, expensiveRuns: () => expensiveRuns };
}

function scenarios(store: ReturnType<typeof makeStore>, ids: string[]) {
  // Open 30 tabs
  for (const id of ids) store.getState().openTab({ id, content: "" });
  // 1000 keystrokes on first tab
  for (let i = 0; i < 1000; i++) store.getState().setContent(ids[0], "x".repeat(i));
  // Close 5 tabs
  for (let i = 0; i < 5; i++) store.getState().closeTab(ids[ids.length - 1 - i]);
}

const tabIds = Array.from({ length: 30 }, (_, i) => `tab${i}`);

const oldStore = makeStore();
const oldSub = attachOldSubscriber(oldStore);
const tOld = performance.now();
scenarios(oldStore, tabIds);
const tOldEnd = performance.now() - tOld;

const newStore = makeStore();
const newSub = attachNewSubscriber(newStore);
const tNew = performance.now();
scenarios(newStore, tabIds);
const tNewEnd = performance.now() - tNew;

console.log("\n=== Cache-prune subscriber: BEFORE vs AFTER ===");
console.table([
  { variant: "BEFORE (runs on every change)", expensive_runs: oldSub.expensiveRuns(), wall_ms: +tOldEnd.toFixed(2) },
  { variant: "AFTER  (gated on id-list change)", expensive_runs: newSub.expensiveRuns(), wall_ms: +tNewEnd.toFixed(2) },
]);
console.log("Expected runs after fix: 35 (30 opens + 5 closes). Before: 1035 (+ 1000 keystrokes).");

if (newSub.expensiveRuns() <= 40 && oldSub.expensiveRuns() > 1000) {
  console.log("\n✅ Subscriber correctly skips keystroke path; only fires on structural changes.");
  process.exit(0);
} else {
  console.log(`\n❌ Got ${newSub.expensiveRuns()} expensive runs (expected ≤40).`);
  process.exit(1);
}
