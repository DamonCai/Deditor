import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEditorStore } from "../store/editor";
import { fuzzyMatch } from "./fuzzy";
import { isEnabled } from "./shortcuts";
import { isWindowCloseCommitted } from "./windowCloseGuard";
import { logWarn } from "./logger";

export const RECENT_FILES_LIMIT = 100;
export function normalizeRecentFiles(paths: unknown): string[] {
  return Array.isArray(paths) ? [...new Set(paths.filter((p): p is string => typeof p === "string" && p.trim().length > 0 && !p.includes("\0")))].slice(0, RECENT_FILES_LIMIT) : [];
}
export function filterRecentFiles(paths: string[], query: string): string[] {
  const words = query.trim().split(/\s+/).filter(Boolean);
  return paths.filter(path => words.every(word => fuzzyMatch(word, path.replace(/\\/g, "/"))));
}
/** Same binding for browser previews; the native File menu owns it in Tauri. */
export function handleRecentFilesKey(event: KeyboardEvent): boolean {
  if (isWindowCloseCommitted() || event.isComposing || event.key.toLowerCase() !== "e" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false;
  if (!isEnabled(useEditorStore.getState().shortcuts, "file_recent")) return false;
  event.preventDefault();
  event.stopPropagation();
  useEditorStore.getState().setRecentFilesOpen(!useEditorStore.getState().recentFilesOpen);
  return true;
}
/** Call after hydration; store activation also covers tab switching and Save As. */
export function installRecentFiles(): () => void {
  let disposed = false;
  let events = 0;
  let unlisten: (() => void) | undefined;
  let unsubscribe: (() => void) | undefined;
  const activePath = () => {
    const state = useEditorStore.getState();
    const tab = state.tabs.find(tab => tab.id === state.activeId);
    return tab && !tab.diff ? tab.filePath : null;
  };
  let previous: string | null = null;
  const noteActive = () => {
    const path = activePath();
    if (path === previous) return;
    previous = path;
    if (!path || isWindowCloseCommitted()) return;
    const current = useEditorStore.getState().recentFiles;
    useEditorStore.setState({ recentFiles: [path, ...current.filter(p => p !== path)].slice(0, RECENT_FILES_LIMIT) });
    void invoke("record_recent_file", { path }).catch(error => logWarn("Record recent file failed", error));
  };
  unsubscribe = useEditorStore.subscribe(noteActive);
  noteActive();
  const onWindowFocus = () => { previous = null; noteActive(); };
  window.addEventListener("focus", onWindowFocus);
  void (async () => {
    try {
      unlisten = await listen<string[]>("recent-files-changed", event => {
        if (disposed) return;
        events++;
        useEditorStore.setState({ recentFiles: normalizeRecentFiles(event.payload) });
      });
      if (disposed) { unlisten(); return; }
      const version = events;
      try {
        const paths = await invoke<string[]>("read_recent_files");
        if (!disposed && events === version) useEditorStore.setState({ recentFiles: normalizeRecentFiles(paths) });
      } catch (error) { logWarn("Read recent files failed", error); }
    } catch (error) { logWarn("Listen for recent files failed", error); }
    if (disposed) return;
  })();
  return () => { disposed = true; unlisten?.(); unsubscribe?.(); window.removeEventListener("focus", onWindowFocus); };
}
