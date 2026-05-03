import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
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
  // Workers need ES output because they themselves use dynamic import()
  // (Shiki language packs in lib/shikiWorker.ts). The default IIFE format
  // forbids code-splitting.
  worker: {
    format: "es",
  },
}));
