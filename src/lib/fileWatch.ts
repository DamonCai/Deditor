import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "../store/editor";
import { logInfo, logWarn } from "./logger";
import { isBinaryRenderable } from "./lang";

const POLL_MS = 3000;

/** Poll mtimes of every open named tab and reload (or flag conflict) when a
 *  file changed outside DEditor. Initial mtime is captured on first sight,
 *  so opening a file doesn't trigger an immediate "external change" alert.
 *
 *  Two power-saving rules: (1) skip the tick entirely when the document is
 *  hidden (background tab / minimized window) — nothing the user can see
 *  needs refreshing, and (2) catch up immediately on visibilitychange so the
 *  refocus feels instant. */
export function useFileWatch(): void {
  useEffect(() => {
    const lastMtimes = new Map<string, number>();
    let stopped = false;

    const tick = async () => {
      // Skip work entirely when the document is hidden. The next focus
      // (visibilitychange listener below) will run a fresh tick — so an
      // external edit caught up to the moment the user refocuses without
      // burning IPCs in the background.
      if (typeof document !== "undefined" && document.hidden) return;
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

      for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        const mt = mtimes[i];
        if (mt == null) continue;
        const prev = lastMtimes.get(path);
        // First sighting — just record the baseline; don't react.
        if (prev === undefined) {
          lastMtimes.set(path, mt);
          continue;
        }
        if (prev === mt) continue;
        lastMtimes.set(path, mt);

        // mtime changed — read the new content and decide what to do.
        let fresh: string;
        try {
          fresh = await invoke<string>("read_text_file", { path });
        } catch {
          continue;
        }
        const cur = useEditorStore.getState().tabs.find((t) => t.filePath === path);
        if (!cur) continue;
        // Disk content already matches what we have — false alarm
        // (could be e.g. our own write or a touch with no real change).
        if (fresh === cur.content) continue;
        // Disk matches what we last saved → it's our own write (the user has
        // since kept typing, so cur.content drifted from disk). No external
        // editor was involved; just bump the mtime baseline silently.
        if (fresh === cur.savedContent) continue;

        if (cur.content === cur.savedContent) {
          // Clean tab: silently swap in the new content.
          useEditorStore.setState({
            tabs: useEditorStore.getState().tabs.map((t) =>
              t.id === cur.id ? { ...t, content: fresh, savedContent: fresh, externalChange: undefined } : t,
            ),
          });
          logInfo(`reloaded externally-changed file: ${path}`);
        } else {
          // Dirty tab: stash disk content and surface a banner.
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
    const onVis = () => {
      if (typeof document !== "undefined" && !document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stopped = true;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
}
