import { isMarkdown } from "../lib/lang";
import { memo } from "react";
import { useShallow } from "zustand/shallow";
import Editor from "./Editor";
import { useEditorStore } from "../store/editor";

interface Props {
  tabId: string;
  /** True for the slot currently visible inside EditorHost. EditorHost keeps
   *  every visited tab's Editor mounted (display: none for inactive ones);
   *  without this flag, the most-recently-mounted Editor would forever own
   *  the toolbar / undo target via editorBridge.setActiveView, even after
   *  the user switched tabs. Editor re-registers itself as the active view
   *  whenever this flips true. */
  active?: boolean;
  theme: "light" | "dark";
  fontSize: number;
  /** When true, skip the per-tab CodeMirror state cache (split-view secondary). */
  noStateCache?: boolean;
  initialCursor?: number;
  initialScrollLine?: number;
  externalScrollLine?: number;
  onScroll?: (line: number) => void;
  onPositionChange?: (pos: { cursor: number; scrollTopLine: number }) => void;
}

/** Thin wrapper around <Editor> that reads its own tab's content / filePath /
 *  diff from the store. Lets App.tsx stop subscribing to active content —
 *  App no longer re-renders on every keystroke. EditorSlot only wakes when
 *  *its* tab's slice actually changes. */
const EditorSlot = memo(function EditorSlot({
  tabId,
  active,
  theme,
  fontSize,
  noStateCache,
  initialCursor,
  initialScrollLine,
  externalScrollLine,
  onScroll,
  onPositionChange,
}: Props) {
  const tab = useEditorStore(
    useShallow((s) => {
      const t = s.tabs.find((x) => x.id === tabId);
      return t
        ? { content: t.content, filePath: t.filePath, diff: t.diff }
        : null;
    }),
  );
  const sourceVisible = useEditorStore(s => s.markdownMode === "source" || s.markdownMode === "split");
  const setContent = useEditorStore((s) => s.setContent);
  if (!tab) return null;
  return (
    <Editor
      tabId={tabId}
      active={isMarkdown(tab.filePath) && !tab.diff ? (sourceVisible ? active : false) : active}
      value={tab.content}
      filePath={tab.filePath}
      diff={tab.diff}
      theme={theme}
      fontSize={fontSize}
      noStateCache={noStateCache}
      initialCursor={initialCursor}
      initialScrollLine={initialScrollLine}
      externalScrollLine={externalScrollLine}
      onChange={(v) => setContent(v, tabId, "source")}
      onScroll={onScroll}
      onPositionChange={onPositionChange}
    />
  );
});

export default EditorSlot;
