import { useEditorStore } from "../store/editor";
import { getActiveView, getActiveViewTabId, subscribeActiveEditor } from "./editorBridge";
import { getVisualEditor, subscribeVisualEditor } from "./markdownVisualBridge";
import { isBinaryRenderable, isCsv, isHtml, isMarkdown } from "./lang";
import { isWindowCloseCommitted } from "./windowCloseGuard";

let pending: (() => void) | undefined;
/** Hand focus to the chosen file after the palette releases its focus trap. */
export function focusRecentFile(tabId: string): () => void {
  pending?.();
  const initial = useEditorStore.getState();
  const file = initial.tabs.find(tab => tab.id === tabId);
  if (!file || isBinaryRenderable(file.filePath) ||
      (isCsv(file.filePath) && initial.csvMode === "read") ||
      (isHtml(file.filePath) && initial.previewMaximized)) return () => {};
  let frame = 0, done = false;
  let settledFocus: Element | null | undefined;
  const subscriptions: (() => void)[] = [];
  const cancel = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    subscriptions.forEach(stop => stop());
    document.removeEventListener("pointerdown", cancel, true);
    window.removeEventListener("blur", cancel);
    if (pending === cancel) pending = undefined;
  };
  const valid = () => {
    const state = useEditorStore.getState();
    return !isWindowCloseCommitted() && state.activeId === tabId && state.activePane === initial.activePane &&
      state.markdownMode === initial.markdownMode && state.csvMode === initial.csvMode &&
      state.previewMaximized === initial.previewMaximized &&
      !state.recentFilesOpen && !state.gotoAnythingOpen && !state.commandPaletteOpen && !state.gotoSymbolOpen && !state.findInFilesOpen && !state.settingsOpen;
  };
  const focus = () => {
    frame = 0;
    if (done) return;
    if (!valid() || document.querySelector('[role="dialog"][aria-modal="true"]')) { cancel(); return; }
    if (settledFocus !== undefined && document.activeElement !== settledFocus) { cancel(); return; }
    settledFocus = document.activeElement;
    if (isMarkdown(file.filePath) && initial.markdownMode === "visual") {
      const editor = getVisualEditor();
      if (editor?.tabId !== tabId || !editor.editable) return;
      cancel();
      (editor.restoreFocus ?? editor.focus)();
    } else {
      const editor = getActiveView();
      if (!editor || getActiveViewTabId() !== tabId) return;
      cancel(); editor.focus();
    }
  };
  const schedule = () => {
    if (done) return;
    if (!valid()) { cancel(); return; }
    if (!frame) frame = requestAnimationFrame(focus);
  };
  pending = cancel;
  subscriptions.push(subscribeActiveEditor(schedule), subscribeVisualEditor(schedule), useEditorStore.subscribe(schedule));
  document.addEventListener("pointerdown", cancel, true);
  window.addEventListener("blur", cancel);
  schedule();
  return cancel;
}
