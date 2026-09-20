import { EditorView } from "@codemirror/view";
import { useEditorStore } from "../store/editor";
import { getActiveView, getActiveViewTabId, subscribeActiveEditor } from "./editorBridge";
import { isMarkdown } from "./lang";
import { getVisualEditor, subscribeVisualEditor } from "./markdownVisualBridge";

let pending: (() => void) | null = null;
export function cancelSearchNavigation() { pending?.(); }

/** Keep a result pending until its editor is ready, including a lazy first open. */
export function navigateSearchResult(tabId: string, line: number, column: number, length: number) {
  cancelSearchNavigation();
  const initial = useEditorStore.getState();
  const pane = initial.activePane, mode = initial.markdownMode;
  let frame = 0, done = false;
  const subscriptions: (() => void)[] = [];
  const cancel = () => {
    done = true;
    if (pending === cancel) pending = null;
    cancelAnimationFrame(frame);
    subscriptions.forEach(unsubscribe => unsubscribe());
  };
  const isCurrent = () => {
    const state = useEditorStore.getState();
    return state.activeId === tabId && state.activePane === pane && state.markdownMode === mode;
  };
  const jump = () => {
    frame = 0;
    if (done) return;
    if (!isCurrent()) { cancel(); return; }
    const target = useEditorStore.getState().tabs.find(tab => tab.id === tabId);
    if (!target) { cancel(); return; }
    if (isMarkdown(target.filePath) && mode === "visual") {
      const visual = getVisualEditor();
      if (visual?.tabId !== tabId || !visual.navigate) return;
      // Unsubscribe before navigation publishes the new selection.
      cancel();
      visual.navigate(line, column, { length, center: true });
    } else {
      const view = getActiveView();
      if (!view || getActiveViewTabId() !== tabId) return;
      cancel();
      const lineInfo = view.state.doc.line(Math.max(1, Math.min(line, view.state.doc.lines)));
      const pos = lineInfo.from + Math.min(lineInfo.length, Math.max(0, column - 1));
      view.dispatch({
        selection: { anchor: pos, head: Math.min(lineInfo.to, pos + length) },
        effects: EditorView.scrollIntoView(pos, { y: "center", x: "nearest" }),
      });
      view.focus();
    }
  };
  const schedule = () => {
    if (done) return;
    if (!isCurrent()) { cancel(); return; }
    // Let startup cursor restoration and the closing search dialog finish first.
    if (!frame) frame = requestAnimationFrame(jump);
  };
  pending = cancel;
  subscriptions.push(subscribeVisualEditor(schedule), subscribeActiveEditor(schedule), useEditorStore.subscribe(schedule));
  schedule();
  return cancel;
}
