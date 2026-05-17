/** Idle-time prefetch of heavy lazy chunks.
 *
 *  After the app shell has painted and the user has had a moment to settle,
 *  we kick off `import(...)` calls for chunks the user is *likely* to need
 *  soon. The browser parses them in the background while no one is typing,
 *  so the first time the user actually invokes the feature, the JS is
 *  already cached + parsed and the operation completes within a frame.
 *
 *  Net effect: zero increase in cold-start cost (these run after first
 *  paint, on `requestIdleCallback` slices), but every "first time"
 *  operation feels instant.
 *
 *  Each prefetch wraps its import in a try/catch and silently swallows
 *  failures — prefetching is best-effort. The real call site does its own
 *  error handling.
 */

import { logDebug } from "./logger";

type Importer = () => Promise<unknown>;

/** Schedule `fn` to run on the next idle slice, falling back to a generous
 *  setTimeout when `requestIdleCallback` isn't available (Safari / older
 *  WebKit). The point is to NEVER race with user interaction. */
function onIdle(fn: () => void, deadlineMs = 50): void {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
    .requestIdleCallback;
  if (typeof ric === "function") {
    ric(fn, { timeout: 5000 });
  } else {
    setTimeout(fn, deadlineMs);
  }
}

/** Run prefetches one at a time, each on its own idle slice. Sequential
 *  (not Promise.all) so we never starve the main thread with a parse storm.
 *  Total wall time: a handful of seconds in the background, completely
 *  invisible. */
function runQueue(queue: Array<{ name: string; fn: Importer }>): void {
  const step = () => {
    const next = queue.shift();
    if (!next) return;
    onIdle(() => {
      const t0 = performance.now();
      next
        .fn()
        .then(() => {
          logDebug(
            `[prefetch] ${next.name} ready (${(performance.now() - t0).toFixed(0)}ms)`,
          );
        })
        .catch(() => {
          /* best-effort; the real call site handles failures */
        })
        .finally(step);
    });
  };
  step();
}

/** Kick off the prefetch sequence. Call once, after the app shell has had
 *  a chance to paint. We schedule the FIRST prefetch with a brief delay so
 *  the very first interactive frames belong entirely to the user. */
export function scheduleIdlePrefetch(): void {
  // Order matters: most-likely-to-be-needed first, so if the user starts
  // poking around mid-prefetch the earliest chunks are already in.
  const queue: Array<{ name: string; fn: Importer }> = [
    // Shiki engine + markdown-it: needed the moment a .md file opens with
    // preview on. Heaviest after CodeMirror — biggest win to pre-warm.
    { name: "highlight (Shiki engine)", fn: () => import("./highlight").then((m) => m.getHighlighter()) },
    { name: "markdown renderer", fn: () => import("./markdown") },
    // KaTeX: only ~260 KB but immediately needed if any opened doc has math.
    { name: "katex", fn: () => import("@vscode/markdown-it-katex") },
    // Mermaid: ~600 KB lazy chunk. Pre-warm so the first ```mermaid``` block
    // paints without the half-second engine-load gap.
    { name: "mermaid", fn: () => import("mermaid") },
    // PlantUML encoder: small but real if the doc has PUML.
    { name: "plantuml-encoder", fn: () => import("plantuml-encoder") },
    // Export pipeline (HTML/PDF) — pulls markdown-it + Shiki again so the
    // cache is already warm; explicitly listing ensures the export.ts
    // module itself is parsed.
    { name: "export", fn: () => import("./export") },
    // Prettier standalone: only needed when the user hits Format. Small
    // but worth pre-warming since the first format would otherwise sit
    // on a 100 ms wait for the standalone to load.
    { name: "prettier/standalone", fn: () => import("prettier/standalone") },
  ];

  // Wait a beat after first paint before starting — let real user input
  // win any contention in the first ~300 ms.
  setTimeout(() => runQueue(queue), 300);
}
