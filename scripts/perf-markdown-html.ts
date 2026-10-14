import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { renderMarkdown } from "../src/lib/markdown";

const source = process.argv[2]
  ? fs.readFileSync(process.argv[2], "utf8")
  : "```html\n<svg width=\"100%\" viewBox=\"0 0 680 360\"><rect x=\"8\" y=\"8\" width=\"664\" height=\"344\" fill=\"var(--slate-50)\"/></svg>\n```\n";

const started = performance.now();
const first = await renderMarkdown(source, { theme: "light" });
const coldMs = performance.now() - started;
const warmStarted = performance.now();
const second = await renderMarkdown(source, { theme: "light" });
const warmMs = performance.now() - warmStarted;
if (first !== second) throw new Error("HTML Markdown rendering changed between identical runs");
console.log(JSON.stringify({
  sourceBytes: Buffer.byteLength(source),
  htmlBytes: Buffer.byteLength(first),
  coldMs: Number(coldMs.toFixed(2)),
  warmMs: Number(warmMs.toFixed(2)),
}));
