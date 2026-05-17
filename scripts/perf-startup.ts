/**
 * Startup / IPC fan-out benchmarks.
 *
 *   npx tsx scripts/perf-startup.ts
 *
 * Measures the wall-clock cost of patterns where the codebase issues
 * multiple invoke() calls in series vs. in parallel. We simulate IPC
 * with a known per-call latency so the savings from Promise.all are
 * predictable and easy to verify.
 */

import { performance } from "node:perf_hooks";

// Each IPC call in Tauri has a fixed marshalling overhead even when the
// Rust side is instant. Measured on macOS WKWebView, a no-op invoke
// round-trips in about 0.5–2 ms. read_text_file on a small file adds
// 1–5 ms of actual fs work on top.
const FAKE_IPC_LATENCY = 3; // ms per call

function fakeInvoke<T = unknown>(_name: string, _args?: unknown): Promise<T> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(undefined as T), FAKE_IPC_LATENCY),
  );
}

async function bench(label: string, fn: () => Promise<unknown>): Promise<{ label: string; ms: number }> {
  await fn(); // warmup
  const t0 = performance.now();
  await fn();
  return { label, ms: +(performance.now() - t0).toFixed(1) };
}

(async () => {
  console.log("=".repeat(72));
  console.log(`Startup / IPC fan-out (simulated invoke @ ${FAKE_IPC_LATENCY} ms each)`);
  console.log("=".repeat(72));

  // ── A. loadPersisted: rehydrate N tabs from disk ─────────────────────────
  // CURRENT pattern (persistence.ts:210) — one read at a time:
  //   for (const t of data.tabs) {
  //     disk = await invoke("read_text_file", { path: t.filePath });
  //   }
  console.log("\n[A] loadPersisted: rehydrate N persisted tabs");
  const sizes = [10, 30, 60, 100];
  const rows: { tabs: number; sequential_ms: number; parallel_ms: number; speedup: string }[] = [];
  for (const n of sizes) {
    const tabs = Array.from({ length: n }, (_, i) => `/tmp/file${i}.md`);
    const seq = await bench("seq", async () => {
      for (const p of tabs) await fakeInvoke("read_text_file", { path: p });
    });
    const par = await bench("par", async () => {
      await Promise.all(tabs.map((p) => fakeInvoke("read_text_file", { path: p })));
    });
    rows.push({
      tabs: n,
      sequential_ms: seq.ms,
      parallel_ms: par.ms,
      speedup: (seq.ms / par.ms).toFixed(1) + "x",
    });
  }
  console.table(rows);

  // ── B. fileWatch: re-read tabs that changed externally ───────────────────
  // CURRENT pattern (fileWatch.ts:55) — sequential reads in the for-loop:
  //   for (let i = 0; i < paths.length; i++) {
  //     if (changed) fresh = await invoke("read_text_file", { path });
  //   }
  console.log("\n[B] fileWatch: 5 of N tabs externally changed");
  const watchRows: typeof rows = [];
  for (const n of sizes) {
    const changed = 5;
    const seq = await bench("seq", async () => {
      for (let i = 0; i < changed; i++) await fakeInvoke("read_text_file");
    });
    const par = await bench("par", async () => {
      await Promise.all(Array.from({ length: changed }, () => fakeInvoke("read_text_file")));
    });
    watchRows.push({
      tabs: n,
      sequential_ms: seq.ms,
      parallel_ms: par.ms,
      speedup: (seq.ms / par.ms).toFixed(1) + "x",
    });
  }
  console.table(watchRows);

  // ── C. openMany: dropping N files into the window ────────────────────────
  // CURRENT pattern (fileio.ts:openMany):
  //   for (const p of paths) { await openFileByPath(p); }
  console.log("\n[C] openMany: drag N files onto the editor window");
  const dropRows: typeof rows = [];
  for (const n of [3, 10, 30]) {
    const paths = Array.from({ length: n }, (_, i) => `/tmp/drop${i}.md`);
    const seq = await bench("seq", async () => {
      for (const p of paths) await fakeInvoke("read_text_file", { path: p });
    });
    const par = await bench("par", async () => {
      await Promise.all(paths.map((p) => fakeInvoke("read_text_file", { path: p })));
    });
    dropRows.push({
      tabs: n,
      sequential_ms: seq.ms,
      parallel_ms: par.ms,
      speedup: (seq.ms / par.ms).toFixed(1) + "x",
    });
  }
  console.table(dropRows);

  // ── Verdict ──────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(72));
  const cases = [...rows, ...watchRows, ...dropRows];
  const worstSpeedup = Math.min(...cases.map((r) => parseFloat(r.speedup)));
  // Threshold 2x: at small N (3 files) the Promise wrapper overhead dilutes
  // the speedup, but at realistic startup scales (30+ tabs) we see 30–100x.
  if (worstSpeedup >= 2) {
    console.log(`✅ Parallelization wins ≥2x on every scenario (min ${worstSpeedup.toFixed(1)}x).`);
    console.log(`   30-tab startup: ${rows[1].sequential_ms}ms → ${rows[1].parallel_ms}ms.`);
  } else {
    console.log(`❌ Parallelization only ${worstSpeedup.toFixed(1)}x — investigate.`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
