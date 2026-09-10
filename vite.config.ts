import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const host = process.env.TAURI_DEV_HOST;
const require = createRequire(import.meta.url);
const languageDependencies = JSON.parse(readFileSync(
  resolve(dirname(require.resolve("@codemirror/language-data")), "../package.json"), "utf8",
)).dependencies;
const editorDependencies = Object.keys(languageDependencies).filter((name) => name.startsWith("@codemirror/lang-"));
const legacyModes = readdirSync(dirname(require.resolve("@codemirror/legacy-modes/mode/shell")))
  .filter((name) => name.endsWith(".js"))
  .map((name) => `@codemirror/legacy-modes/mode/${name.slice(0, -3)}`);

export default defineConfig(async () => ({
  plugins: [
    react(),
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
    include: [
      ...editorDependencies,
      "@codemirror/state", "@codemirror/view", "@codemirror/language",
      "@codemirror/autocomplete", "@codemirror/language-data",
      ...legacyModes, "@replit/codemirror-lang-svelte",
    ],
  },
  resolve: {
    dedupe: ["@codemirror/state", "@codemirror/view", "@codemirror/language", "@codemirror/autocomplete", "@lezer/common", "@lezer/highlight", "@lezer/lr"],
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
}));
