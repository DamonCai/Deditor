// Direct shared-renderer probe over the ignored read-only copy of the reported file.
import source from "./artifacts/markdown-html-fence-2026-09-14/current-user-review.md?raw";
import { renderMarkdown } from "../src/lib/markdown";
import { hydrateMarkdownDisplay, markdownDisplayHtml } from "../src/lib/markdownDisplay";
import "../src/styles.css";

const root = document.getElementById("root")!;
root.className = "preview";
const started = performance.now();
const rendered = await renderMarkdown(source, { theme: "light" });
const parsedAt = performance.now();
const clean = markdownDisplayHtml(rendered);
const sanitizedAt = performance.now();
root.innerHTML = clean;
const mountedAt = performance.now();
hydrateMarkdownDisplay(root, { theme: "light" });
await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
const finishedAt = performance.now();
document.documentElement.dataset.metrics = JSON.stringify({
  renderMs: Number((parsedAt - started).toFixed(2)),
  sanitizeMs: Number((sanitizedAt - parsedAt).toFixed(2)),
  mountMs: Number((mountedAt - sanitizedAt).toFixed(2)),
  hydrateMs: Number((finishedAt - mountedAt).toFixed(2)),
  totalMs: Number((finishedAt - started).toFixed(2)),
});
