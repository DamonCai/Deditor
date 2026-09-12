import { logWarn } from "./logger";
import { tStatic } from "./i18n";

/** mermaid is ~700 KB; load it lazily only when a `.mermaid-diagram`
 *  placeholder appears. Cached after first import. */
let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;
let initializedTheme: string | null = null;
let renderQueue: Promise<unknown> = Promise.resolve();

async function getMermaid(theme: "light" | "dark", forExport = false) {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => m.default);
  }
  const m = await mermaidPromise;
  if (initializedTheme !== `${theme}-${forExport}`) {
    m.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      htmlLabels: !forExport,
      flowchart: { htmlLabels: !forExport },
      theme: theme === "dark" ? "dark" : "default",
    });
    initializedTheme = `${theme}-${forExport}`;
  }
  return m;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function failureMarkup(err: unknown, source: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  const headline = tStatic("markdown.mermaidError", { error: raw });
  return (
    `<div class="mermaid-error-msg">${escapeHtml(headline)}</div>` +
    (source ? `<pre class="mermaid-source">${escapeHtml(source)}</pre>` : "")
  );
}

let renderCounter = 0;

/** Replace every `.mermaid-diagram[data-mermaid-source]` placeholder in `root`
 *  with rendered SVG. Re-callable: ones already hydrated are skipped via a
 *  `data-mermaid-hydrated` flag. Returns an AbortController so the caller can
 *  cancel pending renders on unmount. */
export function hydrateMermaid(
  root: HTMLElement,
  theme: "light" | "dark",
  forExport = false,
): AbortController & { done: Promise<void> } {
  const ctrl = Object.assign(new AbortController(), {
    done: Promise.resolve(),
  });
  const placeholders = root.querySelectorAll<HTMLElement>(
    ".mermaid-diagram[data-mermaid-source]",
  );
  if (placeholders.length === 0) return ctrl;

  ctrl.done = (async () => {
    for (const el of Array.from(placeholders)) {
      if (ctrl.signal.aborted) return;
      if (el.dataset.mermaidHydrated === "1") continue;
      const source = el.dataset.mermaidSource || "";
      if (!source.trim()) continue;
      el.dataset.mermaidHydrated = "1";
      const id = `mermaid-${++renderCounter}`;
      try {
        // Initialization and rendering share one queue: export's light/SVG-text
        // settings cannot race with a dark preview or change another diagram.
        const task = renderQueue.then(async () => {
          // A newer document can replace this root while another render holds
          // the queue. Do not spend diagram layout work on its stale source.
          if (ctrl.signal.aborted) return;
          const mermaid = await getMermaid(theme, forExport);
          if (ctrl.signal.aborted) return;
          return mermaid.render(id, source);
        });
        renderQueue = task.catch(() => undefined);
        const result = await task;
        if (ctrl.signal.aborted || !result) return;
        const { svg, bindFunctions } = result;
        el.innerHTML = svg;
        if (bindFunctions) bindFunctions(el);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        logWarn("mermaid render failed", err);
        // mermaid leaves a stray <svg id="..."> behind in document.body when
        // render fails; clean it up so the DOM doesn't accumulate junk.
        document.getElementById(id)?.remove();
        el.classList.add("error");
        el.innerHTML = failureMarkup(err, source);
      }
    }
  })();

  return ctrl;
}
