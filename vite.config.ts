import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

const host = process.env.TAURI_DEV_HOST;

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
  clearScreen: false,
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
