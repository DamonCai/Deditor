import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useShallow } from "zustand/shallow";
import { FiChevronDown, FiPlus, FiX } from "react-icons/fi";
import { LuGitCompare } from "react-icons/lu";
import { useEditorStore, isTabDirty, type Tab } from "../store/editor";
import { closeTabById, closeOtherTabs, newFile, revealInFinder } from "../lib/fileio";
import { useT, tStatic } from "../lib/i18n";
import LangIcon from "./LangIcon";
import ContextMenu, { type MenuItem } from "./ContextMenu";
import { Button } from "./ui/Button";

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
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

// Zero props — wrap default export in memo so App re-renders (scroll-sync,
// splitter drag) don't re-run TabBar's body. Internal store subscriptions
// still wake it when relevant fields change.
function TabBarImpl() {
  const t = useT();
  // Per-field selectors. tabs is shallow-compared so a keystroke (which mutates
  // tabs[].content but keeps the same object identity for all other tabs)
  // still re-renders TabBar (the active tab's reference changes), but each
  // TabItem below is memoized so only the active one actually re-renders.
  const tabs = useEditorStore(useShallow((s) => s.tabs));
  const activeId = useEditorStore((s) => s.activeId);
  const setActive = useEditorStore((s) => s.setActive);
  const reorderTabs = useEditorStore((s) => s.reorderTabs);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [hiddenTabIds, setHiddenTabIds] = useState<string[]>([]);
  const stripRef = useRef<HTMLDivElement>(null);
  const overflowBtnRef = useRef<HTMLButtonElement>(null);
  const tabOrder = JSON.stringify(tabs.map((tab) => tab.id));
  const hiddenTabs = tabs.filter((tab) => hiddenTabIds.includes(tab.id));

  const measureOverflow = useCallback(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const bounds = strip.getBoundingClientRect();
    // Include the space returned when the dropdown button disappears, so
    // showing the button cannot itself keep an otherwise fitting tab hidden.
    const available = strip.clientWidth + (overflowBtnRef.current?.getBoundingClientRect().width ?? 0);
    const next = strip.scrollWidth <= available + 1 ? [] :
      [...strip.querySelectorAll<HTMLElement>("[data-tab-id]")]
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.left < bounds.left - 1 || rect.right > bounds.right + 1;
        })
        .map((el) => el.dataset.tabId!);
    setHiddenTabIds((previous) => previous.length === next.length && previous.every((id, i) => id === next[i]) ? previous : next);
    if (!next.length) setOverflowOpen(false);
  }, []);

  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measureOverflow);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(strip);
    strip.querySelectorAll<HTMLElement>("[data-tab-id]").forEach((el) => observer.observe(el));
    strip.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    measureOverflow();
    return () => {
      observer.disconnect();
      strip.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, [tabOrder, measureOverflow]);

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
        tabEls[insertBeforeIdx].style.borderLeft = "3px solid var(--accent)";
      }
      if (insertBeforeIdx === tabEls.length) {
        const last = tabEls[tabEls.length - 1];
        if (last) last.style.borderRight = "3px solid var(--accent)";
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

  const revealTab = useCallback((id: string | null) => {
    const strip = stripRef.current;
    if (!strip) return;
    const el = strip.querySelector<HTMLElement>(`[data-tab-id="${id}"]`);
    if (el) el.scrollIntoView({ block: "nearest", inline: "nearest" });
    measureOverflow();
  }, [measureOverflow]);

  // Scroll active tab into view whenever it changes.
  useLayoutEffect(() => { revealTab(activeId); }, [activeId, revealTab]);

  // Stable callbacks so memo'd TabItem children don't all re-render when
  // some unrelated tab field changes. They receive tab data via params
  // rather than closure capture.
  const handleTabClick = useCallback(
    (tabId: string) => {
      if (preventClick.current) { preventClick.current = false; return; }
      setActive(tabId);
    },
    [setActive],
  );
  const handleTabClose = useCallback((tabId: string) => closeTabById(tabId), []);
  const handleTabContextMenu = useCallback(
    (e: React.MouseEvent, tab: Tab) => {
      e.preventDefault();
      e.stopPropagation();
      // Read tabs length imperatively so the handler doesn't have to depend
      // on tabs (which changes ref on every keystroke).
      const tabsLen = useEditorStore.getState().tabs.length;
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
        onClick: () => void closeOtherTabs(tab.id),
        disabled: tabsLen <= 1,
      });
      setMenu({ x: e.clientX, y: e.clientY, items });
    },
    [t],
  );

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
        {tabs.map((tab, idx) => (
          <TabItem
            key={tab.id}
            tab={tab}
            index={idx}
            active={tab.id === activeId}
            onTabClick={handleTabClick}
            onTabClose={handleTabClose}
            onTabContextMenu={handleTabContextMenu}
            onTabMouseDown={onMouseDownTab}
          />
        ))}
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={newFile}
        title={t("tabbar.newTab")}
        style={iconBtnStyle}
      >
        <FiPlus size={14} />
      </Button>
      {hiddenTabs.length > 0 && <Button
        ref={overflowBtnRef}
        variant="ghost"
        size="icon"
        onClick={() => setOverflowOpen((v) => !v)}
        title={t("tabbar.hiddenTabs", { n: hiddenTabs.length })}
        aria-expanded={overflowOpen}
        aria-controls={overflowOpen ? "tab-overflow-dropdown" : undefined}
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
          {hiddenTabs.length}
        </span>
      </Button>}
      {overflowOpen && hiddenTabs.length > 0 && (
        <OverflowDropdown
          tabs={hiddenTabs}
          activeId={activeId}
          anchorRef={overflowBtnRef}
          onPick={(id) => {
            setActive(id);
            // The active tab can also be outside the strip after manual scroll.
            revealTab(id);
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

const TabItem = memo(function TabItem({
  tab,
  index,
  active,
  onTabClick,
  onTabClose,
  onTabContextMenu,
  onTabMouseDown,
}: {
  tab: Tab;
  index: number;
  active: boolean;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onTabContextMenu?: (e: React.MouseEvent, tab: Tab) => void;
  onTabMouseDown: (e: React.MouseEvent, idx: number) => void;
}) {
  const dirty = isTabDirty(tab);
  const untitled = tStatic("common.untitled");
  const name = tab.diff
    ? `${basename(tab.diff.leftPath)} ↔ ${basename(tab.diff.rightPath)}`
    : tab.filePath
    ? tab.filePath.split(/[\\/]/).pop()
    : untitled;
  const tooltip = tab.diff
    ? `${tab.diff.leftPath}\n↔\n${tab.diff.rightPath}`
    : tab.filePath ?? untitled;
  return (
    <div
      data-tab-id={tab.id}
      onClick={() => onTabClick(tab.id)}
      onContextMenu={onTabContextMenu ? (e) => onTabContextMenu(e, tab) : undefined}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onTabClose(tab.id);
          return;
        }
        onTabMouseDown(e, index);
      }}
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
        style={{ maxWidth: 160, color: dirty && !active ? "var(--accent)" : undefined }}
      >
        {name}
      </span>
      <Button variant="ghost" size="icon"
        onClick={(e) => {
          e.stopPropagation();
          onTabClose(tab.id);
        }}
        title={tStatic("tabbar.closeShortcut")}
        style={{ width: 20, height: 20 }}>
        {dirty ? <span style={{ fontSize: 10 }}>●</span> : <FiX size={14} />}
      </Button>
    </div>
  );
});

function OverflowDropdown({
  tabs,
  activeId,
  anchorRef,
  onPick,
  onClose,
  onDismiss,
}: {
  tabs: Tab[];
  activeId: string | null;
  anchorRef: React.RefObject<HTMLButtonElement>;
  onPick: (id: string) => void;
  onClose: (id: string) => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const untitled = t("common.untitled");
  const [filter, setFilter] = useState("");
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  useLayoutEffect(() => {
    const btn = anchorRef.current;
    if (!btn) return;
    const updatePosition = () => {
      const r = btn.getBoundingClientRect();
      const next = { top: r.bottom + 2, right: window.innerWidth - r.right };
      setPos((previous) => previous.top === next.top && previous.right === next.right ? previous : next);
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    if (btn.parentElement) observer.observe(btn.parentElement);
    window.addEventListener("resize", updatePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
    };
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
      ? `${basename(tb.diff.leftPath)} ↔ ${basename(tb.diff.rightPath)}`
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
          className="deditor-input deditor-input--compact"
          autoFocus
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("tabbar.searchPlaceholder", { n: tabs.length })}
          style={{
            width: "100%",
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
              <Button variant="ghost" size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tb.id);
                }}
                title={t("tabbar.close")}
                style={{ width: 20, height: 20 }}>
                <FiX size={14} />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const TabBar = memo(TabBarImpl);
export default TabBar;
