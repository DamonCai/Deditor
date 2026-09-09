import { memo, useEffect, useState } from "react";
import { useShallow } from "zustand/shallow";
import { useEditorStore } from "../store/editor";
import EditorSlot from "./EditorSlot";
import { useRetainedTabs } from "../lib/retainedTabs";
import { isBinaryRenderable } from "../lib/lang";

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

/** Retain the eight most recent text editors. Older ones keep immutable
 * CodeMirror state (undo, bookmarks, folds, selections), without live DOM.
 * Media/XMind remain mounted to preserve playback and their editing sessions. */
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

  const recent = useRetainedTabs(activeId, tabIds);
  const pinned = useEditorStore(useShallow((s) => s.tabs.filter((t) => isBinaryRenderable(t.filePath)).map((t) => t.id)));

  const [mounted, setMounted] = useState<Set<string>>(
    () => new Set(activeId ? [activeId] : []),
  );

  // Track visited tabs; the recent/pinned filter below controls live DOM.
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
      {Array.from(mounted).filter((id) => id === activeId || recent.includes(id) || pinned.includes(id)).map((id) => {
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
              active={visible}
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
