import { useEffect, useRef, useState } from "react";

export interface MenuAction {
  label: string;
  /** Optional — items with a `submenu` may omit it (the row only opens the
   *  child panel; selecting an action there bubbles up via the chain). */
  onClick?: () => void;
  disabled?: boolean;
  divider?: false;
  /** Cascading submenu, JetBrains-style. Hovering for ~150ms (or clicking)
   *  the row opens this list of items in a panel anchored to the row's
   *  right edge. Items inside can themselves nest further. */
  submenu?: MenuItem[];
  /** Right-aligned shortcut hint (display only). Match what the action's
   *  keymap binding would print, e.g. "⌘A", "⇧⌘K". */
  shortcut?: string;
}
export interface MenuDivider {
  divider: true;
}
export type MenuItem = MenuAction | MenuDivider;

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

/** Right-click / context menu. Supports nested submenus (each child renders
 *  its own positioned panel). Outside-click and Escape close the whole chain;
 *  clicking inside any panel keeps it open via stopPropagation. */
export default function ContextMenu({ x, y, items, onClose }: Props) {
  useEffect(() => {
    const onDocClick = () => onClose();
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Use a microtask so the click that opened the menu doesn't immediately
    // close it. Same outside-click handler covers every nested panel because
    // each panel calls stopPropagation on its own mousedown.
    const t = window.setTimeout(() => {
      window.addEventListener("mousedown", onDocClick);
      window.addEventListener("contextmenu", onDocClick);
    }, 0);
    window.addEventListener("keydown", onEsc);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("contextmenu", onDocClick);
      window.removeEventListener("keydown", onEsc);
    };
  }, [onClose]);

  return <Panel x={x} y={y} items={items} onSelect={onClose} />;
}

interface PanelProps {
  x: number;
  y: number;
  items: MenuItem[];
  /** Called when the user picks any non-submenu action — bubbles up the
   *  cascade so the topmost ContextMenu can close. */
  onSelect: () => void;
}

const HOVER_DELAY = 150;
const PANEL_MIN_W = 180;

function Panel({ x, y, items, onSelect }: PanelProps) {
  const [openSub, setOpenSub] = useState<{
    index: number;
    x: number;
    y: number;
  } | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const hoverTimer = useRef<number | null>(null);

  const cancelHover = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  const openSubAt = (index: number) => {
    const row = rowRefs.current[index];
    if (!row) return;
    const r = row.getBoundingClientRect();
    setOpenSub({ index, x: r.right - 4, y: r.top - 4 });
  };

  const onRowEnter = (index: number, hasSub: boolean) => {
    cancelHover();
    if (hasSub) {
      hoverTimer.current = window.setTimeout(() => openSubAt(index), HOVER_DELAY);
    } else if (openSub) {
      // Hovering a non-submenu row collapses any open child — matches
      // JetBrains, where moving sideways into a sibling closes the cascade.
      setOpenSub(null);
    }
  };

  // Position — clamp inside viewport. Item count guides a reasonable height
  // estimate; long sub-cascades can scroll their child panel independently.
  const margin = 8;
  const approxH = items.length * 26 + 12;
  const maxX = window.innerWidth - PANEL_MIN_W - margin;
  const maxY = window.innerHeight - approxH - margin;
  const left = Math.min(x, Math.max(margin, maxX));
  const top = Math.min(y, Math.max(margin, maxY));

  return (
    <>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        onMouseLeave={cancelHover}
        style={{
          position: "fixed",
          top,
          left,
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          boxShadow: "var(--shadow-popup)",
          padding: "4px 0",
          minWidth: PANEL_MIN_W,
          maxHeight: window.innerHeight - 16,
          overflowY: "auto",
          fontSize: 13,
          zIndex: 2000,
        }}
      >
        {items.map((item, i) => {
          if ("divider" in item) {
            return (
              <div
                key={i}
                style={{
                  height: 1,
                  background: "var(--border)",
                  margin: "4px 0",
                }}
              />
            );
          }
          const hasSub = !!(item.submenu && item.submenu.length > 0);
          const isOpenSub = openSub?.index === i;
          return (
            <div
              key={i}
              ref={(el) => {
                rowRefs.current[i] = el;
              }}
              onMouseEnter={() => onRowEnter(i, hasSub && !item.disabled)}
              onClick={(e) => {
                if (item.disabled) return;
                if (hasSub) {
                  e.stopPropagation();
                  cancelHover();
                  if (isOpenSub) setOpenSub(null);
                  else openSubAt(i);
                  return;
                }
                item.onClick?.();
                onSelect();
              }}
              style={{
                padding: "5px 12px",
                cursor: item.disabled ? "not-allowed" : "pointer",
                color: item.disabled ? "var(--text-soft)" : "var(--text)",
                userSelect: "none",
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: isOpenSub ? "var(--hover-bg)" : "transparent",
              }}
              onMouseOver={(e) => {
                if (!item.disabled && !isOpenSub)
                  e.currentTarget.style.background = "var(--hover-bg)";
              }}
              onMouseOut={(e) => {
                if (!isOpenSub) e.currentTarget.style.background = "";
              }}
            >
              <span style={{ flex: 1, whiteSpace: "nowrap" }}>{item.label}</span>
              {item.shortcut && !hasSub && (
                <span
                  style={{
                    color: "var(--text-soft)",
                    fontSize: 11,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {item.shortcut}
                </span>
              )}
              {hasSub && (
                <span
                  style={{
                    color: "var(--text-soft)",
                    fontSize: 12,
                    width: 10,
                    textAlign: "right",
                  }}
                >
                  ›
                </span>
              )}
            </div>
          );
        })}
      </div>
      {openSub && (
        <Panel
          x={openSub.x}
          y={openSub.y}
          items={(items[openSub.index] as MenuAction).submenu!}
          onSelect={onSelect}
        />
      )}
    </>
  );
}
