import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useShallow } from "zustand/shallow";
import { useEditorPaneId, useEditorStore } from "../store/editor";
import { isMarkdown } from "../lib/lang";
import { currentWindowLabel } from "../lib/editorWindows";
import { retainVisualTabs, VISUAL_OVERFLOW_IDLE_MS, type VisualVisit } from "../lib/retainedVisualTabs";
import MarkdownVisualSlot, { supportsRetainedVisualFrames } from "./MarkdownVisualSlot";
import { getVisualEditor, subscribeVisualEditor } from "../lib/markdownVisualBridge";
import "./markdown-visual-slots.css";

/** Closed and evicted tabs release DOM but keep shared editing history. */
const MarkdownVisualHost = memo(function MarkdownVisualHost({ activeId, active, focused = true, theme }: {
  activeId: string | null;
  active: boolean;
  focused?: boolean;
  theme: "light" | "dark";
}) {
  const eligible = useEditorStore(useShallow(s => s.tabs.filter(tab => !tab.diff && isMarkdown(tab.filePath)).map(tab => tab.id)));
  const panes = useEditorStore(s => s.panes ? 2 : 1);
  const visibleId = active && activeId && eligible.includes(activeId) ? activeId : null;
  const [recent, setRecent] = useState<{ active: string | null; visits: VisualVisit[] }>({ active: null, visits: [] });
  const [costs, setCosts] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [, refresh] = useState(0);
  const measure = useCallback((id: string, bytes: number | undefined) => {
    setCosts(old => {
      if (old.get(id) === bytes) return old;
      const next = new Map(old);
      if (bytes === undefined) next.delete(id);
      else next.set(id, bytes);
      return next;
    });
  }, []);
  const now = Date.now();
  const previous = recent.active !== visibleId && recent.active
    ? recent.visits.map(visit => visit.id === recent.active ? { ...visit, usedAt: now } : visit)
    : recent.visits;
  // Include the destination in this render, without waiting for the MRU effect.
  // Secondary native windows use independent JS heaps. Limit the extra
  // budget to the main window so opening more windows cannot multiply it.
  const extended = supportsRetainedVisualFrames() && currentWindowLabel() === "main";
  const visits = retainVisualTabs(previous, visibleId, eligible, costs, now, panes, extended);
  const retained = new Set(visits.map(visit => visit.id));
  const firstExtra = visits.find(visit => visit.extra);
  const expiry = firstExtra ? firstExtra.usedAt + VISUAL_OVERFLOW_IDLE_MS : 0;
  useEffect(() => {
    if (recent.active !== visibleId || recent.visits.length !== visits.length
      || visits.some((visit, i) => visit.id !== recent.visits[i].id || visit.extra !== recent.visits[i].extra)) {
      setRecent({ active: visibleId, visits });
    }
    if ([...costs.keys()].some(id => !retained.has(id))) {
      setCosts(old => new Map([...old].filter(([id]) => retained.has(id))));
    }
  });
  useEffect(() => {
    if (!expiry) return;
    const update = () => refresh(value => value + 1);
    const timer = setTimeout(update, Math.max(1, expiry - Date.now()));
    // WebKit can throttle the timer while its window is minimized.
    document.addEventListener("visibilitychange", update);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", update); };
  }, [expiry]);
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
      (editor.restoreFocus ?? editor.focus)();
    };
    const unsubscribe = subscribeVisualEditor(focus);
    focus();
    return unsubscribe;
  }, [activeId, visibleId, focused]);
  return <div className="md-visual-host" hidden={!visibleId}>
    {eligible.filter(id => retained.has(id)).map(id => <MarkdownVisualSlot key={id} tabId={id} active={id === visibleId} focused={focused} theme={theme} measure={extended ? measure : undefined} />)}
  </div>;
});

export default MarkdownVisualHost;
