import { useEditorStore } from "../store/editor";
import { isMarkdown } from "./lang";
import { markdownSession } from "./markdownSession";
export function markdownHistory(redo = false, id = useEditorStore.getState().activeId) {
  const store = useEditorStore.getState();
  const tab = store.tabs.find(t => t.id === id);
  if (!tab || tab.diff || !isMarkdown(tab.filePath)) return false;
  const session = markdownSession(tab.id, tab.content);
  if (redo ? session.redo() : session.undo()) {
    useEditorStore.setState(s => ({ tabs: s.tabs.map(t => t.id === tab.id ? { ...t, content: session.source } : t) }));
  }
  // Consume even at history boundary: a projection's private history is never used.
  return true;
}
