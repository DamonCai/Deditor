import { memo } from "react";
import { useShallow } from "zustand/shallow";
import Editor from "./Editor";
import { useEditorStore } from "../store/editor";

interface Props {
  tabId: string;
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
  const setContent = useEditorStore((s) => s.setContent);
  if (!tab) return null;
  return (
    <Editor
      tabId={tabId}
      value={tab.content}
      filePath={tab.filePath}
      diff={tab.diff}
      theme={theme}
      fontSize={fontSize}
      noStateCache={noStateCache}
      initialCursor={initialCursor}
      initialScrollLine={initialScrollLine}
      externalScrollLine={externalScrollLine}
      onChange={(v) => setContent(v, tabId)}
      onScroll={onScroll}
      onPositionChange={onPositionChange}
    />
  );
});

export default EditorSlot;
