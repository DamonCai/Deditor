import { useEffect } from "react";

export interface MenuAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  divider?: false;
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

export default function ContextMenu({ x, y, items, onClose }: Props) {
  useEffect(() => {
    const onDocClick = () => onClose();
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Use a microtask so the click that opened the menu doesn't immediately close it.
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

  // Adjust position if it would overflow the viewport.
  const maxX = window.innerWidth - 200;
  const maxY = window.innerHeight - items.length * 28 - 16;
  const left = Math.min(x, Math.max(0, maxX));
  const top = Math.min(y, Math.max(0, maxY));

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top,
        left,
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        boxShadow: "var(--shadow-popup)",
        padding: "4px 0",
        minWidth: 160,
        fontSize: 13,
        zIndex: 2000,
      }}
    >
      {items.map((item, i) =>
        "divider" in item ? (
          <div
            key={i}
            style={{
              height: 1,
              background: "var(--border)",
              margin: "4px 0",
            }}
          />
        ) : (
          <div
            key={i}
            onClick={() => {
              if (item.disabled) return;
              item.onClick();
              onClose();
            }}
            style={{
              padding: "5px 14px",
              cursor: item.disabled ? "not-allowed" : "pointer",
              color: item.disabled ? "var(--text-soft)" : "var(--text)",
              userSelect: "none",
            }}
            onMouseEnter={(e) => {
              if (!item.disabled)
                e.currentTarget.style.background = "var(--hover-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "";
            }}
          >
            {item.label}
          </div>
        ),
      )}
    </div>
  );
}
