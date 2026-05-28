import { memo, useEffect, useState } from "react";
import { useShallow } from "zustand/shallow";
import { useEditorStore } from "../store/editor";
import Preview from "./Preview";

interface Props {
  activeId: string | null;
  theme: "light" | "dark";
  /** Editor's current top line for the ACTIVE tab — forwarded only to that
   *  tab's Preview. Inactive previews get undefined so they keep their own
   *  scroll position untouched. */
  scrollLine?: number;
  /** Scroll callback wired only to the active Preview. */
  onScroll?: (line: number) => void;
}

/** Mirrors EditorHost: keeps a Preview instance mounted for every visited
 *  tab. Switching tabs is a CSS `display` toggle so each tab's preview
 *  scroll, rendered html cache, and TOC state are preserved independently
 *  — switching A→B→A does NOT touch A's preview at all.
 *
 *  Memory cost: each Preview keeps a rendered html string + Mermaid SVGs in
 *  its DOM. For typical markdown tabs that's tens of KB; for very large
 *  markdown files it can be more. Tabs are dropped from the set when the
 *  user closes the tab (or when the file becomes a non-markdown — Preview
 *  for that tab is then unnecessary and the slot is cleaned up below).
 */
/** Thin wrapper that reads ONE tab's saved scroll line at mount time and
 *  passes it as initialScrollLine to Preview. We capture it via useState
 *  initializer so it doesn't re-fetch on every render — the snap-to-line
 *  should fire once, on first html render, then stay out of the way. */
function PreviewSlot({
  tabId,
  active,
  theme,
  scrollLine,
  onScroll,
}: {
  tabId: string;
  active: boolean;
  theme: "light" | "dark";
  scrollLine?: number;
  onScroll?: (line: number) => void;
}) {
  // Captured ONCE on mount — the initial-scroll-line is whatever the editor
  // had saved for this tab when this Preview first appeared. Later edits to
  // the editor's position don't retroactively re-snap the preview.
  const [initialScrollLine] = useState(
    () => useEditorStore.getState().tabPositions[tabId]?.scrollTopLine,
  );
  return (
    <Preview
      tabId={tabId}
      active={active}
      theme={theme}
      scrollLine={scrollLine}
      initialScrollLine={initialScrollLine}
      onScroll={onScroll}
    />
  );
}

const PreviewHost = memo(function PreviewHost({
  activeId,
  theme,
  scrollLine,
  onScroll,
}: Props) {
  // Only keep Preview slots for tabs that ARE markdown — opening a .png or
  // .pdf doesn't justify a Preview instance. The set of "preview-eligible
  // tab ids" is what we mount.
  const previewableIds = useEditorStore(
    useShallow((s) =>
      s.tabs
        .filter((t) => {
          if (t.diff) return false;
          if (!t.filePath) return false;
          const lower = t.filePath.toLowerCase();
          return (
            lower.endsWith(".md") ||
            lower.endsWith(".markdown") ||
            lower.endsWith(".mdx")
          );
        })
        .map((t) => t.id),
    ),
  );

  const [mounted, setMounted] = useState<Set<string>>(
    () => new Set(activeId && previewableIds.includes(activeId) ? [activeId] : []),
  );

  // When a new previewable tab becomes active, mount its slot.
  useEffect(() => {
    if (!activeId) return;
    if (!previewableIds.includes(activeId)) return;
    setMounted((prev) =>
      prev.has(activeId) ? prev : new Set([...prev, activeId]),
    );
  }, [activeId, previewableIds]);

  // Drop slots whose tab is closed or is no longer previewable.
  useEffect(() => {
    const live = new Set(previewableIds);
    setMounted((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (live.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [previewableIds]);

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
              display: visible ? "block" : "none",
              minWidth: 0,
            }}
          >
            <PreviewSlot
              tabId={id}
              active={visible}
              theme={theme}
              scrollLine={visible ? scrollLine : undefined}
              onScroll={visible ? onScroll : undefined}
            />
          </div>
        );
      })}
    </div>
  );
});

export default PreviewHost;
