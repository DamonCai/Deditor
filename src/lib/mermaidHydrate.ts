import { logWarn } from "./logger";
import { tStatic } from "./i18n";

/** mermaid is ~700 KB; load it lazily only when a `.mermaid-diagram`
 *  placeholder appears. Cached after first import. */
let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;
let initializedTheme: "light" | "dark" | null = null;

async function getMermaid(theme: "light" | "dark") {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => m.default);
  }
  const m = await mermaidPromise;
  if (initializedTheme !== theme) {
    m.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: theme === "dark" ? "dark" : "default",
    });
    initializedTheme = theme;
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
): AbortController {
  const ctrl = new AbortController();
  const placeholders = root.querySelectorAll<HTMLElement>(
    ".mermaid-diagram[data-mermaid-source]",
  );
  if (placeholders.length === 0) return ctrl;

  void (async () => {
    let mermaid;
    try {
      mermaid = await getMermaid(theme);
    } catch (err) {
      logWarn("mermaid load failed", err);
      placeholders.forEach((el) => {
        if (ctrl.signal.aborted) return;
        if (el.dataset.mermaidHydrated === "1") return;
        el.dataset.mermaidHydrated = "1";
        el.classList.add("error");
        el.innerHTML = failureMarkup(err, el.dataset.mermaidSource || "");
      });
      return;
    }

    for (const el of Array.from(placeholders)) {
      if (ctrl.signal.aborted) return;
      if (el.dataset.mermaidHydrated === "1") continue;
      const source = el.dataset.mermaidSource || "";
      if (!source.trim()) continue;
      el.dataset.mermaidHydrated = "1";
      const id = `mermaid-${++renderCounter}`;
      try {
        const { svg, bindFunctions } = await mermaid.render(id, source);
        if (ctrl.signal.aborted) return;
        el.innerHTML = svg;
        if (bindFunctions) bindFunctions(el);
      } catch (err) {
        if (ctrl.signal.aborted) return;
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
