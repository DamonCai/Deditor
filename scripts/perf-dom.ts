/**
 * DOM-side hot paths that aren't covered by React Profiler.
 *
 *   npx tsx scripts/perf-dom.ts
 *
 * Examples:
 *   - TabBar drag mousemove recomputes bounding rects for every tab on
 *     every mouse event. This is a real layout-thrash hazard.
 *   - We simulate the work using jsdom; numbers will be in roughly the
 *     same ballpark as a real browser since getBoundingClientRect is
 *     called on plain DOM nodes.
 */
import { JSDOM } from "jsdom";
import { performance } from "node:perf_hooks";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
const doc = dom.window.document;
(globalThis as any).window = dom.window;
(globalThis as any).document = doc;
(globalThis as any).HTMLElement = dom.window.HTMLElement;

function buildTabs(n: number): HTMLElement[] {
  const strip = doc.createElement("div");
  strip.id = "strip";
  doc.body.appendChild(strip);
  const tabs: HTMLElement[] = [];
  for (let i = 0; i < n; i++) {
    const t = doc.createElement("div");
    t.setAttribute("data-tab-id", "tab" + i);
    t.textContent = "tab " + i;
    strip.appendChild(t as any);
    tabs.push(t as any);
  }
  return tabs;
}

function tabBarMoveOld(strip: HTMLElement, clientX: number) {
  const tabEls = Array.from(strip.querySelectorAll<HTMLElement>("[data-tab-id]"));
  let insertBeforeIdx: number | null = null;
  for (let i = 0; i < tabEls.length; i++) {
    const r = tabEls[i].getBoundingClientRect();
    if (clientX < r.left + r.width / 2) {
      insertBeforeIdx = i;
      break;
    }
  }
  if (insertBeforeIdx === null && tabEls.length > 0) insertBeforeIdx = tabEls.length;
  tabEls.forEach((el) => { el.style.borderLeft = ""; el.style.borderRight = ""; });
  if (insertBeforeIdx != null && insertBeforeIdx < tabEls.length) {
    tabEls[insertBeforeIdx].style.borderLeft = "3px solid #4f8cff";
  }
  if (insertBeforeIdx === tabEls.length) {
    const last = tabEls[tabEls.length - 1];
    if (last) last.style.borderRight = "3px solid #4f8cff";
  }
  return insertBeforeIdx;
}

async function measure(n: number, moves: number, label: string, fn: (strip: HTMLElement, x: number) => unknown) {
  doc.body.innerHTML = "";
  buildTabs(n);
  const strip = doc.getElementById("strip")!;
  // warmup
  for (let i = 0; i < 5; i++) fn(strip, i * 30);
  const t0 = performance.now();
  for (let i = 0; i < moves; i++) fn(strip, (i * 7) % 800);
  const dt = performance.now() - t0;
  return { case: label, tabs: n, moves, total_ms: +dt.toFixed(1), per_move_ms: +(dt / moves).toFixed(3) };
}

(async () => {
  console.log("=".repeat(72));
  console.log("TabBar drag mousemove work (jsdom approximation)");
  console.log("=".repeat(72));
  console.log("A mousemove burst during drag fires at ~60–120 Hz. If per-move\n" +
              "cost is e.g. 0.5 ms with 50 tabs, that's ~30 ms/sec of main-thread\n" +
              "work just to draw the drop indicator — visible jank.\n");

  const rows: any[] = [];
  for (const n of [5, 20, 50, 100]) {
    rows.push(await measure(n, 200, "CURRENT (rect/move)", tabBarMoveOld));
  }
  console.table(rows);

  // Verdict: any per_move_ms above 0.5 with 50+ tabs means a 60 Hz mousemove
  // stream will spend > 30 ms/sec doing rect math + style writes.
  const worst = Math.max(...rows.map((r) => r.per_move_ms));
  console.log(`\nWorst per-move: ${worst} ms`);
  console.log(worst > 0.5
    ? "❌ Above the 0.5 ms threshold — worth caching rects + rAF-throttling."
    : "✅ Each move under 0.5 ms; smooth at 60 Hz.");
})().catch((e) => { console.error(e); process.exit(1); });
