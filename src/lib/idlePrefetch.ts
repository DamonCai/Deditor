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

import { useEditorStore } from "../store/editor";
import { isMarkdown } from "./lang";
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
function runQueue(queue: Array<{ name: string; fn: Importer }>, cancelled: () => boolean): void {
  const step = () => {
    if (cancelled()) return;
    const next = queue.shift();
    if (!next) return;
    onIdle(() => {
      if (cancelled()) return;
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
export function scheduleIdlePrefetch(): () => void {
  let cancelled = false;
  const timer = setTimeout(() => {
    const state = useEditorStore.getState();
    const markdown = state.tabs.filter((tab) => !tab.diff && isMarkdown(tab.filePath));
    const queue: Array<{ name: string; fn: Importer }> = [];
    if (markdown.length) {
      queue.push({ name: "highlight", fn: () => import("./highlight").then((m) => m.getHighlighter()) });
      queue.push({ name: "markdown", fn: () => import("./markdown") });
      if (markdown.some((tab) => /\$[^$\n]+\$|\$\$/.test(tab.content))) {
        queue.push({ name: "katex", fn: () => import("@vscode/markdown-it-katex") });
      }
      if (markdown.some((tab) => /(?:```|~~~)mermaid\b/i.test(tab.content))) {
        queue.push({ name: "mermaid", fn: () => import("mermaid") });
      }
      if (markdown.some((tab) => /(?:```|~~~)(?:plantuml|puml|uml)\b/i.test(tab.content))) {
        queue.push({ name: "plantuml", fn: () => import("plantuml-encoder") });
      }
    }
    if (state.formatOnSave) queue.push({ name: "prettier", fn: () => import("prettier/standalone") });
    runQueue(queue, () => cancelled);
  }, 300);
  return () => { cancelled = true; clearTimeout(timer); };
}
