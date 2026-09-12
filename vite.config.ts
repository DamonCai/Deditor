import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";

const host = process.env.TAURI_DEV_HOST;
const require = createRequire(import.meta.url);
const languageDependencies = JSON.parse(readFileSync(
  resolve(dirname(require.resolve("@codemirror/language-data")), "../package.json"), "utf8",
)).dependencies;
const editorDependencies = Object.keys(languageDependencies).filter((name) => name.startsWith("@codemirror/lang-"));
const legacyModes = readdirSync(dirname(require.resolve("@codemirror/legacy-modes/mode/shell")))
  .filter((name) => name.endsWith(".js"))
  .map((name) => `@codemirror/legacy-modes/mode/${name.slice(0, -3)}`);

const markdownDependencies = [
  "@milkdown/crepe/builder", ...["code-mirror", "cursor", "image-block", "latex", "link-tooltip", "list-item", "table"].map(feature => `@milkdown/crepe/feature/${feature}`),
  ...["core", "ctx", "utils", "transformer", "component/image-block", "plugin/history", "plugin/trailing", "preset/commonmark", "preset/gfm",
    "prose", "prose/commands", "prose/inputrules", "prose/model", "prose/schema-list", "prose/state", "prose/tables", "prose/view"].map(entry => `@milkdown/kit/${entry}`),
];

export default defineConfig(async ({ command }) => {
  // A second dev server or launcher's cache reset must not replace chunks
  // already referenced by a live module graph (Milkdown contexts use Symbols).
  const devCache = command === "serve" ? mkdtempSync(join(tmpdir(), "deditor-vite-")) : undefined;
  return ({
  cacheDir: devCache,
  plugins: [
    react(),
    devCache && { name: "deditor-private-dev-cache", closeBundle() { rmSync(devCache, { recursive: true, force: true }); } },
    // Bundle composition report. Generates dist/stats.html — opens a sunburst
    // of what's in each chunk. Useful for tracking down eagerly-imported
    // heavy deps that end up in the main chunk. Gated by ANALYZE=1 so it
    // doesn't add a JS-heavy report file to normal builds.
    process.env.ANALYZE === "1" &&
      visualizer({
        filename: "dist/stats.html",
        template: "treemap",
        gzipSize: true,
        brotliSize: true,
      }),
    process.env.ANALYZE === "1" &&
      visualizer({
        filename: "dist/stats.json",
        template: "raw-data",
      }),
  ].filter(Boolean) as any,
  define: { __VUE_OPTIONS_API__: false, __VUE_PROD_DEVTOOLS__: false, __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false },
  clearScreen: false,
  // Discover lazy parsers before serving the first editor. Otherwise opening
  // another language can rebuild the shared chunks while a live editor still
  // holds the old State/Facet constructors ("Unrecognized extension value").
  optimizeDeps: {
    entries: ["index.html", "tests/markdown-visual-review.html", "tests/xmind-review.html"],
    include: [
      ...editorDependencies, ...markdownDependencies,
      "@codemirror/state", "@codemirror/view", "@codemirror/language",
      "@codemirror/autocomplete", "@codemirror/language-data",
      ...legacyModes, "@replit/codemirror-lang-svelte",
    ],
  },
  resolve: {
    dedupe: ["@milkdown/core", "@milkdown/ctx", "@milkdown/utils", "@milkdown/transformer", "@milkdown/prose", "prosemirror-model", "prosemirror-state", "prosemirror-view", "@codemirror/state", "@codemirror/view", "@codemirror/language", "@codemirror/autocomplete", "@lezer/common", "@lezer/highlight", "@lezer/lr"],
  },
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 5174 }
      : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
});
