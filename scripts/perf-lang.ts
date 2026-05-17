/**
 * Verify lang.ts predicates are still BEHAVIORALLY identical after the
 * Set + extOf rewrite, and measure the speedup on the hot path
 * (isBinaryRenderable, which used to call 5 separate isX predicates).
 *
 *   npx tsx scripts/perf-lang.ts
 */
import { performance } from "node:perf_hooks";
import {
  isMarkdown,
  isJson,
  isImageFile,
  isPdfFile,
  isAudioFile,
  isVideoFile,
  isHexFile,
  isXmindFile,
  isBinaryRenderable,
  detectLang,
} from "../src/lib/lang";

// ── 1. Behavior parity — every documented edge case from the old impl ───────
const cases: Array<[string | null, Record<string, boolean | string>]> = [
  [null, { isMarkdown: true, isJson: false, isImageFile: false, isPdfFile: false, isBinaryRenderable: false, lang: "Markdown" }],
  ["foo.md", { isMarkdown: true, isJson: false, lang: "Markdown" }],
  ["foo.MD", { isMarkdown: true, lang: "Markdown" }],
  ["foo.markdown", { isMarkdown: true, lang: "Markdown" }],
  ["foo.mdx", { isMarkdown: true, lang: "MDX" }],
  ["foo.json", { isJson: true, isMarkdown: false, lang: "JSON" }],
  ["foo.jsonc", { isJson: true }],
  ["foo.json5", { isJson: true }],
  ["/Users/foo/bar/baz.png", { isImageFile: true, isBinaryRenderable: true }],
  ["c:\\users\\foo\\bar.PDF", { isPdfFile: true, isBinaryRenderable: true }],
  ["foo.mp3", { isAudioFile: true, isBinaryRenderable: true }],
  ["foo.MP4", { isVideoFile: true, isBinaryRenderable: true }],
  ["foo.docx", { isHexFile: true, isBinaryRenderable: true }],
  ["foo.xmind", { isXmindFile: true, isBinaryRenderable: true }],
  ["foo.tar.gz", { isHexFile: true, isBinaryRenderable: true }], // ext is "gz"
  ["foo", { isMarkdown: false, isJson: false, isImageFile: false }],   // no extension
  ["~/.config/foo", { isMarkdown: false, isJson: false }],              // dotfile-named, no ext on basename
  ["Dockerfile", { lang: "Dockerfile" }],
];

let fails = 0;
for (const [path, expect] of cases) {
  for (const [k, want] of Object.entries(expect)) {
    const actual =
      k === "isMarkdown" ? isMarkdown(path) :
      k === "isJson" ? isJson(path) :
      k === "isImageFile" ? isImageFile(path) :
      k === "isPdfFile" ? isPdfFile(path) :
      k === "isAudioFile" ? isAudioFile(path) :
      k === "isVideoFile" ? isVideoFile(path) :
      k === "isHexFile" ? isHexFile(path) :
      k === "isXmindFile" ? isXmindFile(path) :
      k === "isBinaryRenderable" ? isBinaryRenderable(path) :
      k === "lang" ? detectLang(path).label :
      undefined;
    if (actual !== want) {
      console.log(`❌ ${JSON.stringify(path)} ${k}: got ${JSON.stringify(actual)}, want ${JSON.stringify(want)}`);
      fails++;
    }
  }
}
if (fails === 0) {
  console.log(`✅ All ${cases.length} parity cases pass (${cases.flatMap((c) => Object.keys(c[1])).length} individual assertions).`);
} else {
  console.log(`\n❌ ${fails} parity failures — predicates changed behavior. Halt.`);
  process.exit(1);
}

// ── 2. Speed of isBinaryRenderable on a realistic path mix ──────────────────
const mix = [
  "/Users/foo/projects/main/src/components/Editor.tsx",
  "/Users/foo/projects/main/src/lib/lang.ts",
  "/Users/foo/projects/main/README.md",
  "/Users/foo/projects/main/assets/logo.png",
  "/Users/foo/projects/main/dist/app.pdf",
  "/Users/foo/projects/main/build/macos.dmg",
  "Dockerfile",
  ".gitignore",
];

function bench(label: string, fn: () => unknown, iters = 200_000) {
  fn(); fn(); // warmup
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) fn();
  return { label, iters, total_ms: +(performance.now() - t0).toFixed(2) };
}

const rBin = bench("isBinaryRenderable(mix) ×200k", () => {
  let n = 0;
  for (const p of mix) if (isBinaryRenderable(p)) n++;
  return n;
});
console.log("\nHot-path speed:");
console.table([rBin]);
console.log(`Per call: ${(rBin.total_ms / (rBin.iters * mix.length) * 1000).toFixed(3)} µs`);

// Reasonable threshold: < 1 µs per call (i.e. < 200 ms for 200k iters × 8 paths)
const perCallUs = (rBin.total_ms / (rBin.iters * mix.length)) * 1000;
if (perCallUs < 2) {
  console.log("\n✅ isBinaryRenderable under 2 µs per call.");
  process.exit(0);
} else {
  console.log(`\n❌ Too slow: ${perCallUs.toFixed(2)} µs/call (target < 2 µs)`);
  process.exit(1);
}
