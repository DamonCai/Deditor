import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "../store/editor";
import { logInfo, logWarn } from "./logger";
import { isBinaryRenderable } from "./lang";

const POLL_MS = 3000;

/** Poll mtimes of every open named tab and reload (or flag conflict) when a
 *  file changed outside DEditor. Initial mtime is captured on first sight,
 *  so opening a file doesn't trigger an immediate "external change" alert. */
export function useFileWatch(): void {
  useEffect(() => {
    const lastMtimes = new Map<string, number>();
    let stopped = false;

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
      if (paths.length === 0) return;

      let mtimes: (number | null)[];
      try {
        mtimes = await invoke<(number | null)[]>("file_mtimes", { paths });
      } catch {
        return;
      }
      if (stopped) return;

      // First pass: figure out which paths actually changed, update the
      // baseline cache for them. We do this before any I/O so we don't
      // double-read the same path on the next tick if the IPC is in flight.
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
        lastMtimes.set(path, mt);
        changedPaths.push(path);
      }
      if (changedPaths.length === 0) return;

      // PARALLEL read of every changed file. Sequential awaits here meant
      // that 5 simultaneous external changes (e.g. a git pull touching
      // several open tabs) took 5× the IPC latency to settle.
      const reads = await Promise.all(
        changedPaths.map((p) =>
          invoke<string>("read_text_file", { path: p }).catch(() => null),
        ),
      );
      if (stopped) return;

      for (let i = 0; i < changedPaths.length; i++) {
        const path = changedPaths[i];
        const fresh = reads[i];
        if (fresh == null) continue;
        const cur = useEditorStore.getState().tabs.find((t) => t.filePath === path);
        if (!cur) continue;
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

    const iv = setInterval(() => void tick(), POLL_MS);
    void tick();
    return () => {
      stopped = true;
      clearInterval(iv);
    };
  }, []);
}
