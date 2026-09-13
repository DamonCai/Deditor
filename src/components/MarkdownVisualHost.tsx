import { memo, useLayoutEffect, useRef } from "react";
import { useShallow } from "zustand/shallow";
import { useEditorPaneId, useEditorStore } from "../store/editor";
import { isMarkdown } from "../lib/lang";
import { retainRecentTabs, useRetainedTabs } from "../lib/retainedTabs";
import MarkdownVisualSlot from "./MarkdownVisualSlot";
import { getVisualEditor, subscribeVisualEditor } from "../lib/markdownVisualBridge";

/** Reuse recently visited reading editors. Source-only tabs stay lazy; closed
 * and evicted tabs release their DOM while keeping the shared document history. */
const MarkdownVisualHost = memo(function MarkdownVisualHost({ activeId, active, focused = true, theme }: {
  activeId: string | null;
  active: boolean;
  focused?: boolean;
  theme: "light" | "dark";
}) {
  const eligible = useEditorStore(useShallow(s => s.tabs.filter(tab => !tab.diff && isMarkdown(tab.filePath)).map(tab => tab.id)));
  const visibleId = active && activeId && eligible.includes(activeId) ? activeId : null;
  const recent = useRetainedTabs(visibleId, eligible);
  // Include the destination in this render, without waiting for the MRU effect.
  const retained = retainRecentTabs(recent, visibleId, eligible);
  const paneId = useEditorPaneId();
  const previousId = useRef(paneId === "right" ? null : activeId);
  useLayoutEffect(() => {
    const changedTab = previousId.current !== activeId;
    previousId.current = activeId;
    // Mode clicks have their own focus request; restoration at startup must
    // not take focus away from another control.
    if (!focused || !visibleId || !changedTab) return;
    // WebKit can retain the previous editor as its native undo responder even
    // after hiding/blurring it. Hand keyboard focus to the destination once it
    // is ready, including an asynchronous first visit.
    let didFocus = false;
    const control = document.activeElement;
    const focus = () => {
      const current = useEditorStore.getState();
      if (current.activeId !== visibleId || current.markdownMode !== "visual" || document.activeElement !== control) { didFocus = true; return; }
      const editor = getVisualEditor();
      if (didFocus || editor?.tabId !== visibleId || !editor.editable) return;
      didFocus = true;
      editor.focus();
    };
    const unsubscribe = subscribeVisualEditor(focus);
    focus();
    return unsubscribe;
  }, [activeId, visibleId, focused]);
  return <div style={{ display: visibleId ? "flex" : "none", flex: "1 1 0", minWidth: 0, height: "100%" }}>
    {eligible.filter(id => retained.includes(id)).map(id => <MarkdownVisualSlot key={id} tabId={id} active={id === visibleId} focused={focused} theme={theme} />)}
  </div>;
});

export default MarkdownVisualHost;
