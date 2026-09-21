import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { flushDocuments } from "./documentFlush";
import { flushPersist, pausePersistence } from "./persistence";
import { useEditorStore } from "../store/editor";
import { showError } from "./feedback";
import { tStatic } from "./i18n";
import { logError } from "./logger";

export function currentWindowLabel(): string {
  return (window as any).__TAURI_INTERNALS__?.metadata?.currentWindow?.label ?? "main";
}
export const windowEventTarget = () => ({ target: { kind: "WebviewWindow" as const, label: currentWindowLabel() } });
export async function newWindow(): Promise<void> {
  try {
    flushDocuments();
    await flushPersist();
    await invoke("new_window");
  } catch (error) {
    logError("New window failed", error);
    void showError(tStatic("window.createFailed", { err: String(error) }));
  }
}

/** Register after hydration; the backend queues requests received during startup. */
export async function installWindowLifecycle(): Promise<() => void> {
  let closing: Promise<void> | undefined;
  let resumePersistence: (() => void) | undefined;
  const close = () => closing ??= (async () => {
    const resume = pausePersistence();
    resumePersistence = resume;
    try {
      flushDocuments();
      await flushPersist();
      const hasDirty = useEditorStore.getState().tabs.some(tab => !tab.diff && tab.content !== tab.savedContent);
      await invoke("finish_window_close", { hasDirty });
    } catch (error) {
      resume();
      logError("Persist window before closing failed", error);
      await invoke("cancel_window_close").catch(error => logError("Cancel window close failed", error));
      void showError(tStatic("window.persistFailed", { err: String(error) }));
    }
  })().finally(() => { closing = undefined; });
  const cancelListener = await listen("window-close-cancelled", () => { resumePersistence?.(); }, windowEventTarget());
  const unlisten = await listen<boolean>("prepare-window-close", () => { void close(); }, windowEventTarget());
  try {
    const pending = await invoke<boolean | null>("window_ready");
    if (pending != null) void close();
  } catch (error) { unlisten(); cancelListener(); throw error; }
  return () => { unlisten(); cancelListener(); };
}
