import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { JSDOM } from "jsdom";
import type { EditorView } from "@milkdown/kit/prose/view";

// DOM bookkeeping only: these timings do not include browser layout or IME.
const dom = new JSDOM("<!doctype html><body></body>");
for (const key of ["window", "document", "Node", "HTMLElement", "Element", "MutationObserver", "Event"] as const)
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
window.matchMedia = (() => ({ matches: false })) as typeof window.matchMedia;
const { installMarkdownAccessibility } = await import("../src/lib/markdownVisual/accessibility");
const rows = [];
for (const tasks of [100, 500, 2000]) {
  const host = document.createElement("div");
  host.innerHTML = '<p>plain paragraph</p>' + Array.from({ length: tasks }, (_, i) => `<div class="milkdown-list-item-block"><div class="label-wrapper"><span class="unchecked"></span></div><div data-content-dom>Task ${i}</div><div class="handle" data-show="false"></div></div>`).join("");
  document.body.append(host);
  const dispose = installMarkdownAccessibility({ dom: host, editable: true } as EditorView);
  const handle = host.querySelector<HTMLElement>(".handle")!;
  const elapsed = [];
  for (let i = 0; i < 35; i++) {
    const start = performance.now();
    handle.dataset.show = String(i % 2 === 0);
    await Promise.resolve(); await Promise.resolve();
    assert.equal(handle.getAttribute("aria-hidden"), String(i % 2 !== 0));
    if (i >= 5) elapsed.push(performance.now() - start);
  }
  elapsed.sort((a, b) => a - b);
  rows.push({ tasks, medianMs: +elapsed[15].toFixed(3), p95Ms: +elapsed[28].toFixed(3) });
  dispose(); host.remove();
}
console.log(JSON.stringify(rows, null, 2));
dom.window.close();
