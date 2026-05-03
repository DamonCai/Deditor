import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "./Editor";
import {
  useEditorStore,
  type TabPosition,
} from "../store/editor";
import { emitScroll, useExternalScrollLine } from "../lib/scrollSync";

interface Props {
  /** Stable list of currently-open tab ids. Receiving ids (not full Tab
   *  objects) lets EditorHost stay flat across keystrokes — App subscribes
   *  to the id list with shallow equality, so a content edit does NOT
   *  bubble up here. Each EditorSlot then subscribes to its own tab's
   *  content directly. */
  tabIds: string[];
  activeId: string | null | undefined;
  theme: "light" | "dark";
  fontSize: number;
  onChange: (value: string) => void;
}

/** Multi-instance editor host. Each tab the user visits gets its own
 *  CodeMirror instance, kept alive in `display:none` while inactive.
 *  Switching back to a previously-visited tab is essentially free —
 *  no CodeMirror rebuild, no Shiki re-tokenize, no git_blame IPC.
 *
 *  Memory grows with the number of visited tabs (~5-15MB per typical
 *  editor instance). User OK'd this trade in the perf request.
 *
 *  Tabs that have never been activated are NOT mounted, so app startup
 *  cost stays the same as before. Closing a tab unmounts its Editor. */
export default function EditorHost({
  tabIds,
  activeId,
  theme,
  fontSize,
  onChange,
}: Props) {
  // Scroll sync subscription lives here (not in App) so high-frequency
  // scroll events stay scoped to Editor + Preview. EditorSlot reads it
  // for its `externalScrollLine`; the active slot also emits via emitScroll.
  const externalScrollLine = useExternalScrollLine("editor");
  const onScroll = useCallback((line: number) => emitScroll(line, "editor"), []);
  // Track which tab ids the user has activated. New activations push,
  // closed tabs are pruned in a separate effect.
  const [mounted, setMounted] = useState<Set<string>>(() =>
    activeId ? new Set([activeId]) : new Set(),
  );

  useEffect(() => {
    if (!activeId) return;
    setMounted((prev) =>
      prev.has(activeId) ? prev : new Set(prev).add(activeId),
    );
  }, [activeId]);

  // Prune mounted set when tabs are closed so we don't leak Editor
  // instances + CodeMirror DOM forever.
  const tabIdSet = useMemo(() => new Set(tabIds), [tabIds]);
  useEffect(() => {
    setMounted((prev) => {
      let dirty = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (tabIdSet.has(id)) next.add(id);
        else dirty = true;
      }
      return dirty ? next : prev;
    });
  }, [tabIdSet]);

  // Render slots in `tabIds` order so DOM order matches tab bar order.
  // Filter to mounted ids only.
  const visibleIds = tabIds.filter((id) => mounted.has(id));

  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        width: "100%",
        flex: 1,
        minWidth: 0,
        minHeight: 0,
      }}
    >
      {visibleIds.map((id) => (
        <EditorSlot
          key={id}
          tabId={id}
          active={id === activeId}
          theme={theme}
          fontSize={fontSize}
          externalScrollLine={externalScrollLine}
          onChange={onChange}
          onScroll={onScroll}
        />
      ))}
    </div>
  );
}

interface SlotProps {
  tabId: string;
  active: boolean;
  theme: "light" | "dark";
  fontSize: number;
  externalScrollLine?: number;
  onChange: (value: string) => void;
  onScroll: (line: number) => void;
}

function EditorSlot({
  tabId,
  active,
  theme,
  fontSize,
  externalScrollLine,
  onChange,
  onScroll,
}: SlotProps) {
  // Per-slot subscription to its own tab. Other slots (not this id) won't
  // fire even when their tabs change, because zustand's selector compares
  // by reference and `tabs.map(...)` reuses the original Tab object for
  // tabs whose id isn't the mutation target. This is the core of the
  // "App doesn't wake on keystrokes" perf win — only the active slot's
  // selector returns a new ref.
  const tab = useEditorStore((s) => s.tabs.find((t) => t.id === tabId));
  // Snapshot the persisted cursor / scroll exactly once at mount time —
  // Editor only reads these on its own mount, so changing the prop later
  // has no effect anyway. Guard with useRef so React strict-mode double
  // mounting doesn't desync.
  const initialPosRef = useRef<TabPosition | undefined>(undefined);
  if (initialPosRef.current === undefined) {
    initialPosRef.current =
      useEditorStore.getState().tabPositions[tabId] ?? ({} as TabPosition);
  }
  const initialPos = initialPosRef.current;

  // Active-tab callbacks bubble to the App's scroll-sync state. Inactive
  // tabs gate them — CodeMirror in display:none shouldn't fire scrolls
  // anyway, but defensive against React state quirks.
  const handleChange = (v: string) => {
    if (active) onChange(v);
  };
  const handleScroll = (line: number) => {
    if (active) onScroll(line);
  };

  // Tab vanished mid-render (race during close) — bail out cleanly.
  if (!tab) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: active ? "flex" : "none",
        flexDirection: "column",
      }}
    >
      <Editor
        tabId={tab.id}
        active={active}
        value={tab.content}
        filePath={tab.filePath}
        diff={tab.diff}
        log={tab.log}
        theme={theme}
        fontSize={fontSize}
        initialCursor={initialPos.cursor}
        initialScrollLine={initialPos.scrollTopLine}
        externalScrollLine={active ? externalScrollLine : undefined}
        onChange={handleChange}
        onScroll={handleScroll}
        onPositionChange={(pos) =>
          useEditorStore.getState().setTabPosition(tab.id, pos)
        }
      />
    </div>
  );
}
