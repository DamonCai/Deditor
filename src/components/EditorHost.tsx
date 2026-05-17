import { memo, useEffect, useState } from "react";
import { useShallow } from "zustand/shallow";
import { useEditorStore } from "../store/editor";
import EditorSlot from "./EditorSlot";

interface Props {
  activeId: string | null;
  theme: "light" | "dark";
  fontSize: number;
  initialCursor?: number;
  initialScrollLine?: number;
  externalScrollLine?: number;
  onScroll?: (line: number) => void;
  onPositionChange?: (pos: { cursor: number; scrollTopLine: number }) => void;
}

/** Keeps an Editor instance mounted for every tab the user has visited.
 *  Switching tabs becomes a CSS display toggle (instant) instead of an Editor
 *  unmount + remount (Shiki re-tokenize, language loader re-fetch, ~50–200ms).
 *
 *  Memory cost: ~5–15 MB per visited Editor (CodeMirror state + DOM). On a
 *  desktop app that's fine; tabs are dropped from the set when closed. */
const EditorHost = memo(function EditorHost({
  activeId,
  theme,
  fontSize,
  initialCursor,
  initialScrollLine,
  externalScrollLine,
  onScroll,
  onPositionChange,
}: Props) {
  // Subscribe to the *list* of tab ids, not the tabs themselves — so a
  // keystroke (which mutates one tab's content, not the id list) doesn't
  // wake EditorHost. useShallow does an element-wise compare on the array.
  const tabIds = useEditorStore(useShallow((s) => s.tabs.map((t) => t.id)));

  const [mounted, setMounted] = useState<Set<string>>(
    () => new Set(activeId ? [activeId] : []),
  );

  // When a new tab becomes active, mount it. We never unmount on switch —
  // that's the whole point. Drop happens via the tabIds effect below.
  useEffect(() => {
    if (!activeId) return;
    setMounted((prev) =>
      prev.has(activeId) ? prev : new Set([...prev, activeId]),
    );
  }, [activeId]);

  // Drop mounted entries for tabs that have been closed (so the Editor
  // instance can be garbage-collected).
  useEffect(() => {
    const live = new Set(tabIds);
    setMounted((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (live.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [tabIds]);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      {Array.from(mounted).map((id) => {
        const visible = id === activeId;
        return (
          <div
            key={id}
            style={{
              position: "absolute",
              inset: 0,
              display: visible ? "flex" : "none",
              minWidth: 0,
            }}
          >
            <EditorSlot
              tabId={id}
              theme={theme}
              fontSize={fontSize}
              // initial cursor / scroll line only meaningful on first mount,
              // which is when EditorSlot is first added to the host.
              initialCursor={visible ? initialCursor : undefined}
              initialScrollLine={visible ? initialScrollLine : undefined}
              externalScrollLine={visible ? externalScrollLine : undefined}
              onScroll={visible ? onScroll : undefined}
              onPositionChange={visible ? onPositionChange : undefined}
            />
          </div>
        );
      })}
    </div>
  );
});

export default EditorHost;
