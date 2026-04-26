import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FiChevronDown, FiPlus, FiX } from "react-icons/fi";
import { useEditorStore, isTabDirty, type Tab } from "../store/editor";
import { closeTabById, newFile, revealInFinder } from "../lib/fileio";
import { useT, tStatic } from "../lib/i18n";
import LangIcon from "./LangIcon";
import ContextMenu, { type MenuItem } from "./ContextMenu";

export default function TabBar() {
  const t = useT();
  const { tabs, activeId, setActive, closeOthers, reorderTabs } = useEditorStore();
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

  const onTabContextMenu = (e: React.MouseEvent, tab: Tab) => {
    e.preventDefault();
    e.stopPropagation();
    const items: MenuItem[] = [];
    if (tab.filePath) {
      items.push({
        label: t("filetree.revealInFinder"),
        onClick: () => revealInFinder(tab.filePath!),
      });
      items.push({ divider: true });
    }
    items.push({ label: t("tabbar.close"), onClick: () => closeTabById(tab.id) });
    items.push({
      label: t("tabbar.closeOthers"),
      onClick: () => closeOthers(tab.id),
      disabled: tabs.length <= 1,
    });
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  return (
    <div
      className="flex items-stretch select-none"
      style={{
        height: 32,
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
            active={tab.id === activeId}
            onClick={() => {
              if (preventClick.current) { preventClick.current = false; return; }
              setActive(tab.id);
            }}
            onClose={() => closeTabById(tab.id)}
            onContextMenu={(e) => onTabContextMenu(e, tab)}
            onMouseDown={(e) => onMouseDownTab(e, idx)}
          />
        ))}
      </div>
      <button
        onClick={newFile}
        title={t("tabbar.newTab")}
        style={iconBtnStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-mute)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <FiPlus size={14} />
      </button>
      <button
        ref={overflowBtnRef}
        onClick={() => setOverflowOpen((v) => !v)}
        title={t("tabbar.allTabs", { n: tabs.length })}
        style={{ ...iconBtnStyle, position: "relative" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-mute)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
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
          {tabs.length}
        </span>
      </button>
      {overflowOpen && (
        <OverflowDropdown
          tabs={tabs}
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
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  border: "none",
  borderLeft: "1px solid var(--border)",
  color: "var(--text-soft)",
  cursor: "pointer",
};

function TabItem({
  tab,
  active,
  onClick,
  onClose,
  onContextMenu,
  onMouseDown,
}: {
  tab: Tab;
  active: boolean;
  onClick: () => void;
  onClose: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const dirty = isTabDirty(tab);
  const untitled = tStatic("common.untitled");
  const name = tab.filePath ? tab.filePath.split(/[\\/]/).pop() : untitled;
  return (
    <div
      data-tab-id={tab.id}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onClose();
          return;
        }
        onMouseDown(e);
      }}
      title={tab.filePath ?? untitled}
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
      {tab.filePath ? (
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
      <span
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        title={tStatic("tabbar.closeShortcut")}
        style={{
          width: 16,
          height: 16,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 3,
          fontSize: 14,
          lineHeight: 1,
          color: "var(--text-soft)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--bg-mute)";
          e.currentTarget.style.color = "var(--text)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "";
          e.currentTarget.style.color = "var(--text-soft)";
        }}
      >
        {dirty ? "●" : "×"}
      </span>
    </div>
  );
}

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

  const filtered = filter
    ? tabs.filter((tb) =>
        (tb.filePath ?? untitled)
          .toLowerCase()
          .includes(filter.toLowerCase()),
      )
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
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
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
          const name = tb.filePath ? tb.filePath.split(/[\\/]/).pop() : untitled;
          return (
            <div
              key={tb.id}
              onClick={() => onPick(tb.id)}
              title={tb.filePath ?? untitled}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 10px",
                fontSize: 12,
                cursor: "pointer",
                background: isActive ? "var(--bg-mute)" : undefined,
                color: isActive ? "var(--accent)" : "var(--text)",
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = "var(--bg-mute)";
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = "";
              }}
            >
              {tb.filePath ? (
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
