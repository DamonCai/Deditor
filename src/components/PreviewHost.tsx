import { memo, useEffect, useState } from "react";
import { useShallow } from "zustand/shallow";
import { useEditorStore } from "../store/editor";
import Preview from "./Preview";
import { useRetainedTabs } from "../lib/retainedTabs";
import { isMarkdown } from "../lib/lang";

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

/** Keep logical preview/search state for visited Markdown tabs, while only
 *  the eight most recent retain document DOM. Reactivation restores the
 *  saved source anchor; closing a tab drops its slot and cached HTML. */
/** Thin wrapper that reads ONE tab's saved scroll line at mount time and
 *  passes it as initialScrollLine to Preview. We capture it via useState
 *  initializer so it doesn't re-fetch on every render — the snap-to-line
 *  should fire once, on first html render, then stay out of the way. */
function PreviewSlot({
  tabId,
  active,
  retainDom,
  theme,
  scrollLine,
  onScroll,
}: {
  tabId: string;
  active: boolean;
  retainDom: boolean;
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
      retainDom={retainDom}
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
          return !t.diff && isMarkdown(t.filePath);
        })
        .map((t) => t.id),
    ),
  );

  const recent = useRetainedTabs(activeId, previewableIds);

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
              retainDom={visible || recent.includes(id)}
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
