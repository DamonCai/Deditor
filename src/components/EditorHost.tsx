import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "./Editor";
import {
  useEditorStore,
  type Tab,
  type TabPosition,
} from "../store/editor";

interface Props {
  tabs: Tab[];
  activeId: string | null | undefined;
  theme: "light" | "dark";
  fontSize: number;
  externalScrollLine?: number;
  onChange: (value: string) => void;
  onScroll: (line: number) => void;
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
  tabs,
  activeId,
  theme,
  fontSize,
  externalScrollLine,
  onChange,
  onScroll,
}: Props) {
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
  const tabIds = useMemo(() => new Set(tabs.map((t) => t.id)), [tabs]);
  useEffect(() => {
    setMounted((prev) => {
      let dirty = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (tabIds.has(id)) next.add(id);
        else dirty = true;
      }
      return dirty ? next : prev;
    });
  }, [tabIds]);

  const visible = tabs.filter((t) => mounted.has(t.id));

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
      {visible.map((tab) => (
        <EditorSlot
          key={tab.id}
          tab={tab}
          active={tab.id === activeId}
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
  tab: Tab;
  active: boolean;
  theme: "light" | "dark";
  fontSize: number;
  externalScrollLine?: number;
  onChange: (value: string) => void;
  onScroll: (line: number) => void;
}

function EditorSlot({
  tab,
  active,
  theme,
  fontSize,
  externalScrollLine,
  onChange,
  onScroll,
}: SlotProps) {
  // Snapshot the persisted cursor / scroll exactly once at mount time —
  // Editor only reads these on its own mount, so changing the prop later
  // has no effect anyway. Guard with useRef so React strict-mode double
  // mounting doesn't desync.
  const initialPosRef = useRef<TabPosition | undefined>(undefined);
  if (initialPosRef.current === undefined) {
    initialPosRef.current =
      useEditorStore.getState().tabPositions[tab.id] ?? ({} as TabPosition);
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
