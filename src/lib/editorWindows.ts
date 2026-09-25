import { commitWindowClose } from "./windowCloseGuard";
export { isWindowCloseCommitted } from "./windowCloseGuard";
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
  let resumeInteraction: (() => void) | undefined;
  let generation = 0;
  let closingGeneration = 0;
  let committedGeneration: number | undefined;
  let retryClose = false;
  const close = (): Promise<void> => {
    if (committedGeneration === generation) return closing ?? Promise.resolve();
    if (closing) {
      // A cancelled flush can still be waiting for disk when a fresh close
      // arrives. Finish that write, then take a new snapshot for the retry.
      if (closingGeneration !== generation) retryClose = true;
      return closing;
    }
    const requestGeneration = closingGeneration = generation;
    return closing = (async () => {
      const resume = pausePersistence();
      resumePersistence = resume;
      try {
        flushDocuments();
        for (;;) {
          const tabs = useEditorStore.getState().tabs;
          await flushPersist();
          if (requestGeneration !== generation) return;
          // Input can arrive while disk is busy. Include any newly flushed
          // editor transaction before acknowledging that this window is safe.
          flushDocuments();
          if (useEditorStore.getState().tabs === tabs) break;
        }
        // Other windows can still be writing after this one's acknowledgement.
        // Hold its now-persisted editor steady until exit or cancellation.
        resumeInteraction = commitWindowClose();
        committedGeneration = requestGeneration;
        const hasDirty = useEditorStore.getState().tabs.some(tab => !tab.diff && (tab.missingOnDisk || tab.content !== tab.savedContent));
        await invoke("finish_window_close", { hasDirty });
      } catch (error) {
        if (requestGeneration !== generation) return;
        resumeInteraction?.();
        committedGeneration = undefined;
        resume();
        logError("Persist window before closing failed", error);
        await invoke("cancel_window_close").catch(error => logError("Cancel window close failed", error));
        void showError(tStatic("window.persistFailed", { err: String(error) }));
      }
    })().finally(() => {
      closing = undefined;
      if (retryClose) { retryClose = false; void close(); }
    });
  };
  const cancelListener = await listen("window-close-cancelled", () => {
    generation++;
    retryClose = false;
    resumeInteraction?.();
    resumePersistence?.();
  }, windowEventTarget());
  const unlisten = await listen<boolean>("prepare-window-close", () => { void close(); }, windowEventTarget());
  try {
    const pending = await invoke<boolean | null>("window_ready");
    if (pending != null) void close();
  } catch (error) { unlisten(); cancelListener(); throw error; }
  return () => {
    generation++;
    retryClose = false;
    resumeInteraction?.();
    resumePersistence?.();
    unlisten();
    cancelListener();
  };
}
