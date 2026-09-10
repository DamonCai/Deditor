import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "../store/editor";
import { logError, logInfo, logWarn } from "./logger";
import { isBinaryRenderable } from "./lang";

const POLL_MS = 3000;

/** Poll mtimes of every open named tab and reload (or flag conflict) when a
 *  file changed outside DEditor. Initial mtime is captured on first sight,
 *  so opening a file doesn't trigger an immediate "external change" alert. */
export function useFileWatch(): void {
  useEffect(() => {
    const lastMtimes = new Map<string, number>();
    let stopped = false;
    let running = false;

    const tick = async () => {
      const tabs = useEditorStore.getState().tabs;
      const paths: string[] = [];
      for (const t of tabs) {
        if (!t.filePath || t.diff) continue;
        // Binary-rendered tabs (image / pdf / audio / video / hex) live as
        // data URLs, not text. read_text_file would WARN on every poll for
        // these — skip them. mtime-driven reload for binaries can be added
        // later if anyone asks; for now just don't spam the log.
        if (isBinaryRenderable(t.filePath)) continue;
        paths.push(t.filePath);
      }
      const openPaths = new Set(paths);
      for (const path of lastMtimes.keys())
        if (!openPaths.has(path)) lastMtimes.delete(path);
      if (paths.length === 0) return;

      let mtimes: (number | null)[];
      try {
        mtimes = await invoke<(number | null)[]>("file_mtimes", { paths });
      } catch {
        return;
      }
      if (stopped) return;

      // A changed mtime is acknowledged only after a successful read.
      // The serialized poll below prevents overlapping/out-of-order reads.
      const changedPaths: string[] = [];
      for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        const mt = mtimes[i];
        if (mt == null) continue;
        const prev = lastMtimes.get(path);
        if (prev === undefined) {
          lastMtimes.set(path, mt);
          continue;
        }
        if (prev === mt) continue;
        changedPaths.push(path);
      }
      if (changedPaths.length === 0) return;

      // PARALLEL read of every changed file. Sequential awaits here meant
      // that 5 simultaneous external changes (e.g. a git pull touching
      // several open tabs) took 5× the IPC latency to settle.
      const reads = await Promise.all(
        changedPaths.map((p) =>
          invoke<string>("read_text_file", { path: p }).catch((err) => {
            logError(`external file reload failed: ${p}`, err);
            return null;
          }),
        ),
      );
      if (stopped) return;

      for (let i = 0; i < changedPaths.length; i++) {
        const path = changedPaths[i];
        const fresh = reads[i];
        if (fresh == null) continue;
        const cur = useEditorStore.getState().tabs.find((t) => t.filePath === path);
        if (!cur) continue;
        const original = tabs.find((t) => t.filePath === path);
        // A save, save-as or close/reopen during I/O makes this read stale.
        if (cur.id !== original?.id || cur.savedContent !== original.savedContent) continue;
        lastMtimes.set(path, mtimes[paths.indexOf(path)]!);
        if (fresh === cur.content) continue;
        if (fresh === cur.savedContent) continue;

        if (cur.content === cur.savedContent) {
          useEditorStore.setState({
            tabs: useEditorStore.getState().tabs.map((t) =>
              t.id === cur.id ? { ...t, content: fresh, savedContent: fresh, externalChange: undefined } : t,
            ),
          });
          logInfo(`reloaded externally-changed file: ${path}`);
        } else {
          useEditorStore.setState({
            tabs: useEditorStore.getState().tabs.map((t) =>
              t.id === cur.id ? { ...t, externalChange: fresh } : t,
            ),
          });
          logWarn(`external change on dirty tab: ${path}`);
        }
      }
    };

    const poll = async () => {
      if (stopped || running) return;
      running = true;
      try { await tick(); } finally { running = false; }
    };
    const iv = setInterval(() => void poll(), POLL_MS);
    void poll();
    return () => {
      stopped = true;
      clearInterval(iv);
    };
  }, []);
}
