import { useEffect, useRef } from "react";
import { FiX } from "react-icons/fi";

interface Props {
  open: boolean;
  title: string;
  /** "sm" 380 / "md" 560 / "lg" 720 / "xl" 960 / "full" 92vw — picks
   *  appropriate width for the dialog content. */
  size?: "sm" | "md" | "lg" | "xl" | "full";
  onClose: () => void;
  /** Footer content (typically Cancel / Confirm buttons). When omitted no
   *  footer renders. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/** Shared modal wrapper used by every Phase 3+ git dialog. Matches the
 *  SettingsDialog visual: dimmed backdrop, rounded panel, header with
 *  close button, scrollable body, optional sticky footer. Esc and
 *  click-outside both close. */
export default function Modal({
  open,
  title,
  size = "md",
  onClose,
  footer,
  children,
}: Props) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    requestAnimationFrame(() => closeBtnRef.current?.focus());
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const widthMap: Record<NonNullable<Props["size"]>, string> = {
    sm: "min(380px, 92vw)",
    md: "min(560px, 92vw)",
    lg: "min(720px, 92vw)",
    xl: "min(960px, 92vw)",
    full: "92vw",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 1100,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: widthMap[size],
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          boxShadow: "var(--shadow-modal)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-soft)",
            fontSize: 14,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <span>{title}</span>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-soft)",
              width: 24,
              height: 24,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 3,
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--hover-bg)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            <FiX size={14} />
          </button>
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
          }}
        >
          {children}
        </div>
        {footer && (
          <div
            style={{
              padding: "10px 14px",
              borderTop: "1px solid var(--border)",
              background: "var(--bg-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 8,
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
