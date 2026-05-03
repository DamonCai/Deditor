import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FiChevronDown, FiPlus, FiX } from "react-icons/fi";
import { LuGitCompare } from "react-icons/lu";
import { useShallow } from "zustand/shallow";
import { useEditorStore, isTabDirty, type Tab } from "../store/editor";
import { closeTabById, newFile, revealInFinder } from "../lib/fileio";
import { useT, tStatic } from "../lib/i18n";
import LangIcon from "./LangIcon";
import ContextMenu, { type MenuItem } from "./ContextMenu";
import { Button } from "./ui/Button";
import { useFileGitStatus, gitStatusColor } from "../lib/git";

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Diff tab title: JetBrains-style "Commit: filename" when the left side is
 *  the magic `HEAD:<rel>` ref produced by the Commit panel; falls back to
 *  the generic two-name layout otherwise. */
function formatDiffTitle(leftPath: string, rightPath: string): string {
  if (leftPath.startsWith("HEAD:")) {
    return `Commit: ${basename(rightPath)}`;
  }
  return `${basename(leftPath)} ↔ ${basename(rightPath)}`;
}

/** Percent-encode each path segment so spaces and unicode survive a paste
 *  into a markdown link / URL field. Separators are preserved so the result
 *  is still a recognizable absolute path. */
function toEncodedPath(path: string): string {
  const sep = path.includes("\\") && !path.includes("/") ? "\\" : "/";
  return path
    .split(sep)
    .map((seg) => encodeURIComponent(seg))
    .join(sep);
}

export default function TabBar() {
  const t = useT();
  // Subscribe to tab ids only (shallow primitive array): structural changes
  // (open / close / reorder) re-render TabBar, but a content edit on any
  // single tab does not. Each TabItem then subscribes to its own Tab
  // object — the per-tab `setContent` mutation reuses unchanged Tab refs
  // (see store/editor.ts), so only the touched tab's selector returns a
  // new value.
  const tabIds = useEditorStore(useShallow((s) => s.tabs.map((t) => t.id)));
  const activeId = useEditorStore((s) => s.activeId);
  const tabCount = tabIds.length;
  const setActive = useEditorStore((s) => s.setActive);
  const closeOthers = useEditorStore((s) => s.closeOthers);
  const reorderTabs = useEditorStore((s) => s.reorderTabs);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const overflowBtnRef = useRef<HTMLButtonElement>(null);

  const dragState = useRef<{ fromIdx: number; startX: number } | null>(null);
  const dropIndicator = useRef<number | null>(null);
  const isDragging = useRef(false);
  const preventClick = useRef(false);

  const onMouseDownTab = useCallback((e: React.MouseEvent, idx: number) => {
    if (e.button !== 0) return;
    dragState.current = { fromIdx: idx, startX: e.clientX };
    isDragging.current = false;
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragState.current) return;
      const dx = Math.abs(e.clientX - dragState.current.startX);
      if (dx < 5) return;

      isDragging.current = true;
      document.body.style.cursor = "grabbing";

      const strip = stripRef.current;
      if (!strip) return;
      const tabEls = Array.from(strip.querySelectorAll<HTMLElement>("[data-tab-id]"));
      let insertBeforeIdx: number | null = null;
      for (let i = 0; i < tabEls.length; i++) {
        const r = tabEls[i].getBoundingClientRect();
        if (e.clientX < r.left + r.width / 2) {
          insertBeforeIdx = i;
          break;
        }
      }
      if (insertBeforeIdx === null && tabEls.length > 0) {
        insertBeforeIdx = tabEls.length;
      }

      tabEls.forEach((el) => { el.style.borderLeft = ""; el.style.borderRight = ""; });
      dropIndicator.current = insertBeforeIdx;
      if (insertBeforeIdx != null && insertBeforeIdx < tabEls.length) {
        tabEls[insertBeforeIdx].style.borderLeft = "3px solid #4f8cff";
      }
      if (insertBeforeIdx === tabEls.length) {
        const last = tabEls[tabEls.length - 1];
        if (last) last.style.borderRight = "3px solid #4f8cff";
      }
    };

    const onUp = () => {
      if (!dragState.current) return;
      const { fromIdx } = dragState.current;
      const toIdx = dropIndicator.current;

      if (isDragging.current && toIdx != null && fromIdx !== toIdx) {
        reorderTabs(fromIdx, toIdx);
        preventClick.current = true;
      }

      document.body.style.cursor = "";
      stripRef.current?.querySelectorAll("[data-tab-id]").forEach((el) => {
        (el as HTMLElement).style.borderLeft = "";
        (el as HTMLElement).style.borderRight = "";
      });
      dropIndicator.current = null;
      dragState.current = null;
      isDragging.current = false;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [reorderTabs]);

  // Scroll active tab into view whenever it changes
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const el = strip.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`);
    if (el) el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);

  // Stable across re-renders so memo'd TabItems don't see a new prop ref.
  // Reads the latest Tab via getState() at click time — no stale capture.
  const onTabContextMenu = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const tab = useEditorStore.getState().tabs.find((x) => x.id === tabId);
      if (!tab) return;
      const items: MenuItem[] = [];
      if (tab.filePath) {
        const path = tab.filePath;
        const name = basename(path);
        items.push({
          label: t("tabbar.copyPath"),
          onClick: () => {
            navigator.clipboard.writeText(path).catch(() => {});
          },
        });
        items.push({
          label: t("tabbar.copyEncodedPath"),
          onClick: () => {
            navigator.clipboard.writeText(toEncodedPath(path)).catch(() => {});
          },
        });
        items.push({
          label: t("tabbar.copyName"),
          onClick: () => {
            navigator.clipboard.writeText(name).catch(() => {});
          },
        });
        items.push({
          label: t("filetree.revealInFinder"),
          onClick: () => revealInFinder(path),
        });
        items.push({ divider: true });
      }
      items.push({ label: t("tabbar.close"), onClick: () => closeTabById(tab.id) });
      items.push({
        label: t("tabbar.closeOthers"),
        onClick: () => closeOthers(tab.id),
        disabled: useEditorStore.getState().tabs.length <= 1,
      });
      setMenu({ x: e.clientX, y: e.clientY, items });
    },
    [closeOthers, t],
  );

  // Click handler is stable too — memo'd children won't see a new ref each
  // render. Looks up the tab id via the wrapper's bound argument.
  const onTabClick = useCallback(
    (tabId: string) => {
      if (preventClick.current) {
        preventClick.current = false;
        return;
      }
      setActive(tabId);
    },
    [setActive],
  );
  const onTabClose = useCallback((tabId: string) => closeTabById(tabId), []);

  return (
    <div
      className="flex items-stretch select-none"
      style={{
        height: 28,
        background: "var(--bg-soft)",
        borderBottom: "1px solid var(--border)",
        position: "relative",
      }}
    >
      <div
        ref={stripRef}
        className="tab-strip flex items-stretch"
        style={{
          flex: 1,
          minWidth: 0,
          overflowX: "auto",
          overflowY: "hidden",
          scrollbarWidth: "none",
        }}
      >
        {tabIds.map((id, idx) => (
          <TabItem
            key={id}
            tabId={id}
            index={idx}
            active={id === activeId}
            onClick={onTabClick}
            onClose={onTabClose}
            onContextMenu={onTabContextMenu}
            onMouseDown={onMouseDownTab}
          />
        ))}
      </div>
      <Button
        variant="ghost"
        onClick={newFile}
        title={t("tabbar.newTab")}
        style={iconBtnStyle}
      >
        <FiPlus size={14} />
      </Button>
      <Button
        ref={overflowBtnRef}
        variant="ghost"
        onClick={() => setOverflowOpen((v) => !v)}
        title={t("tabbar.allTabs", { n: tabCount })}
        style={{ ...iconBtnStyle, position: "relative" }}
      >
        <FiChevronDown size={14} />
        <span
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            fontSize: 9,
            color: "var(--text-soft)",
            lineHeight: 1,
          }}
        >
          {tabCount}
        </span>
      </Button>
      {overflowOpen && (
        <OverflowDropdown
          activeId={activeId}
          anchorRef={overflowBtnRef}
          onPick={(id) => {
            setActive(id);
            setOverflowOpen(false);
          }}
          onClose={(id) => {
            closeTabById(id);
          }}
          onDismiss={() => setOverflowOpen(false)}
        />
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  width: 32,
  height: "100%",
  flexShrink: 0,
  borderRadius: 0,
  borderLeft: "1px solid var(--border)",
  borderTop: "none",
  borderRight: "none",
  borderBottom: "none",
};

interface TabItemProps {
  tabId: string;
  index: number;
  active: boolean;
  onClick: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onContextMenu: (e: React.MouseEvent, tabId: string) => void;
  onMouseDown: (e: React.MouseEvent, idx: number) => void;
}

const TabItem = memo(function TabItem({
  tabId,
  index,
  active,
  onClick,
  onClose,
  onContextMenu,
  onMouseDown,
}: TabItemProps) {
  // Per-tab subscription. Returns the same Tab ref as long as `setContent`
  // didn't target this tab — so a keystroke in another tab leaves this
  // selector unchanged → no re-render. Dirty / git status / name are
  // derived from the tab and re-evaluated only when the tab itself changes.
  const tab = useEditorStore((s) => s.tabs.find((x) => x.id === tabId));
  const handleClick = useCallback(() => onClick(tabId), [onClick, tabId]);
  const handleClose = useCallback(() => onClose(tabId), [onClose, tabId]);
  const handleCtx = useCallback(
    (e: React.MouseEvent) => onContextMenu(e, tabId),
    [onContextMenu, tabId],
  );
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        handleClose();
        return;
      }
      onMouseDown(e, index);
    },
    [handleClose, onMouseDown, index],
  );
  // gitStatus subscription belongs above the early return so hook order
  // stays consistent across renders.
  const gitStatus = useFileGitStatus(tab?.filePath ?? null);
  if (!tab) return null;
  const dirty = isTabDirty(tab);
  const untitled = tStatic("common.untitled");
  const name = tab.diff
    ? formatDiffTitle(tab.diff.leftPath, tab.diff.rightPath)
    : tab.log
      ? `Log: ${basename(tab.log.workspace)}${tab.log.initialPath ? ` — ${tab.log.initialPath}` : ""}`
      : tab.filePath
        ? tab.filePath.split(/[\\/]/).pop()
        : untitled;
  const gitColor = gitStatusColor(gitStatus);
  const tooltip = tab.diff
    ? `${tab.diff.leftPath}\n↔\n${tab.diff.rightPath}`
    : tab.log
      ? `Git Log — ${tab.log.workspace}`
      : tab.filePath ?? untitled;
  return (
    <div
      data-tab-id={tab.id}
      onClick={handleClick}
      onContextMenu={handleCtx}
      onMouseDown={handleMouseDown}
      title={tooltip}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "0 8px 0 10px",
        height: "100%",
        fontSize: 12,
        cursor: "grab",
        background: active ? "var(--bg)" : "transparent",
        color: active ? "var(--text)" : "var(--text-soft)",
        borderRight: "1px solid var(--border)",
        borderTop: active ? "2px solid var(--accent)" : "2px solid transparent",
        flexShrink: 0,
        maxWidth: 220,
      }}
    >
      {tab.diff ? (
        <LuGitCompare size={14} style={{ color: "var(--text-soft)" }} />
      ) : tab.filePath ? (
        <LangIcon filePath={tab.filePath} size={14} />
      ) : (
        <span style={{ width: 14, display: "inline-block" }} />
      )}
      <span
        className="truncate"
        style={{
          maxWidth: 160,
          // Priority: git color > dirty accent > default. Dirty stays visible
          // even on git-clean files because dirty just means "unsaved buffer"
          // — the user still wants the visual cue.
          color:
            gitColor ?? (dirty && !active ? "var(--accent)" : undefined),
          textDecoration: gitStatus === "D" ? "line-through" : undefined,
        }}
      >
        {name}
      </span>
      <span
        onClick={(e) => {
          e.stopPropagation();
          handleClose();
        }}
        title={tStatic("tabbar.closeShortcut")}
        className="dr-tab-close"
        style={{
          width: 16,
          height: 16,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          lineHeight: 1,
        }}
      >
        {dirty ? "●" : "×"}
      </span>
    </div>
  );
});

function OverflowDropdown({
  activeId,
  anchorRef,
  onPick,
  onClose,
  onDismiss,
}: {
  activeId: string | null;
  anchorRef: React.RefObject<HTMLButtonElement>;
  onPick: (id: string) => void;
  onClose: (id: string) => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const untitled = t("common.untitled");
  // Subscribe to the full tab list only while the dropdown is mounted —
  // closing the dropdown unsubscribes, so this never contributes to the
  // keystroke-time subscriber set.
  const tabs = useEditorStore((s) => s.tabs);
  const [filter, setFilter] = useState("");
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  useLayoutEffect(() => {
    const btn = anchorRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    setPos({ top: r.bottom + 2, right: window.innerWidth - r.right });
  }, [anchorRef]);

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      const dd = document.getElementById("tab-overflow-dropdown");
      if (dd?.contains(target)) return;
      onDismiss();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    const timer = window.setTimeout(() => {
      window.addEventListener("mousedown", onDocDown);
    }, 0);
    window.addEventListener("keydown", onEsc);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", onDocDown);
      window.removeEventListener("keydown", onEsc);
    };
  }, [anchorRef, onDismiss]);

  const labelOf = (tb: Tab): string =>
    tb.diff
      ? formatDiffTitle(tb.diff.leftPath, tb.diff.rightPath)
      : tb.log
        ? `Log: ${basename(tb.log.workspace)}`
        : tb.filePath ?? untitled;
  const filtered = filter
    ? tabs.filter((tb) => labelOf(tb).toLowerCase().includes(filter.toLowerCase()))
    : tabs;

  return (
    <div
      id="tab-overflow-dropdown"
      style={{
        position: "fixed",
        top: pos.top,
        right: pos.right,
        width: 320,
        maxHeight: "60vh",
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        boxShadow: "var(--shadow-popup)",
        zIndex: 2000,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>
        <input
          autoFocus
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("tabbar.searchPlaceholder", { n: tabs.length })}
          style={{
            width: "100%",
            background: "var(--bg-soft)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            borderRadius: 4,
            padding: "4px 8px",
            fontSize: 12,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>
      <div style={{ overflowY: "auto", flex: 1, padding: "4px 0" }}>
        {filtered.length === 0 && (
          <div
            style={{
              padding: "8px 12px",
              fontSize: 12,
              color: "var(--text-soft)",
            }}
          >
            {t("tabbar.noMatches")}
          </div>
        )}
        {filtered.map((tb) => {
          const dirty = isTabDirty(tb);
          const isActive = tb.id === activeId;
          const name = labelOf(tb);
          return (
            <div
              key={tb.id}
              onClick={() => onPick(tb.id)}
              title={tb.diff ? `${tb.diff.leftPath}\n↔\n${tb.diff.rightPath}` : tb.filePath ?? untitled}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 10px",
                fontSize: 12,
                cursor: "pointer",
                background: isActive ? "var(--selection-bg)" : undefined,
                color: isActive ? "var(--text)" : "var(--text)",
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = "var(--hover-bg)";
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = "";
              }}
            >
              {tb.diff ? (
                <LuGitCompare size={14} style={{ color: "var(--text-soft)" }} />
              ) : tb.filePath ? (
                <LangIcon filePath={tb.filePath} size={14} />
              ) : (
                <span style={{ width: 14, display: "inline-block" }} />
              )}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  minWidth: 0,
                }}
              >
                <span
                  className="truncate"
                  style={{ color: dirty ? "var(--accent)" : undefined }}
                >
                  {name}
                  {dirty && " ●"}
                </span>
                {tb.filePath && (
                  <span
                    className="truncate"
                    style={{ fontSize: 10, color: "var(--text-soft)" }}
                  >
                    {tb.filePath}
                  </span>
                )}
              </div>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tb.id);
                }}
                title={t("tabbar.close")}
                style={{
                  width: 18,
                  height: 18,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 3,
                  color: "var(--text-soft)",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--border)";
                  e.currentTarget.style.color = "var(--text)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "";
                  e.currentTarget.style.color = "var(--text-soft)";
                }}
              >
                <FiX size={12} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
