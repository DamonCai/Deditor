import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FiChevronDown, FiPlus, FiX } from "react-icons/fi";
import { useEditorStore, isTabDirty, type Tab } from "../store/editor";
import { closeTabById, newFile, revealInFinder } from "../lib/fileio";
import LangIcon from "./LangIcon";
import ContextMenu, { type MenuItem } from "./ContextMenu";

export default function TabBar() {
  const { tabs, activeId, setActive, closeOthers } = useEditorStore();
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const overflowBtnRef = useRef<HTMLButtonElement>(null);

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
        label: "在 Finder 中显示",
        onClick: () => revealInFinder(tab.filePath!),
      });
      items.push({ divider: true });
    }
    items.push({ label: "关闭", onClick: () => closeTabById(tab.id) });
    items.push({
      label: "关闭其他",
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
        {tabs.map((tab) => (
          <TabItem
            key={tab.id}
            tab={tab}
            active={tab.id === activeId}
            onClick={() => setActive(tab.id)}
            onClose={() => closeTabById(tab.id)}
            onContextMenu={(e) => onTabContextMenu(e, tab)}
          />
        ))}
      </div>
      <button
        onClick={newFile}
        title="新建标签 (Cmd/Ctrl+N)"
        style={iconBtnStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-mute)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <FiPlus size={14} />
      </button>
      <button
        ref={overflowBtnRef}
        onClick={() => setOverflowOpen((v) => !v)}
        title={`所有标签 (${tabs.length})`}
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
}: {
  tab: Tab;
  active: boolean;
  onClick: () => void;
  onClose: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const dirty = isTabDirty(tab);
  const name = tab.filePath ? tab.filePath.split(/[\\/]/).pop() : "未命名";
  return (
    <div
      data-tab-id={tab.id}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault();
          onClose();
        }
      }}
      title={tab.filePath ?? "未命名"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "0 8px 0 10px",
        height: "100%",
        fontSize: 12,
        cursor: "pointer",
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
        title="关闭 (Cmd/Ctrl+W)"
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
    const t = window.setTimeout(() => {
      window.addEventListener("mousedown", onDocDown);
    }, 0);
    window.addEventListener("keydown", onEsc);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", onDocDown);
      window.removeEventListener("keydown", onEsc);
    };
  }, [anchorRef, onDismiss]);

  const filtered = filter
    ? tabs.filter((t) =>
        (t.filePath ?? "未命名")
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
          placeholder={`搜索 ${tabs.length} 个标签...`}
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
            没有匹配
          </div>
        )}
        {filtered.map((t) => {
          const dirty = isTabDirty(t);
          const isActive = t.id === activeId;
          const name = t.filePath ? t.filePath.split(/[\\/]/).pop() : "未命名";
          return (
            <div
              key={t.id}
              onClick={() => onPick(t.id)}
              title={t.filePath ?? "未命名"}
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
              {t.filePath ? (
                <LangIcon filePath={t.filePath} size={14} />
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
                {t.filePath && (
                  <span
                    className="truncate"
                    style={{ fontSize: 10, color: "var(--text-soft)" }}
                  >
                    {t.filePath}
                  </span>
                )}
              </div>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(t.id);
                }}
                title="关闭"
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
