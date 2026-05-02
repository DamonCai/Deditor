import { useEffect, useRef, type RefObject } from "react";
import { useGitBranch, useRecentBranches, refreshGit } from "../lib/git";
import { getTerminalHandle } from "./Terminal";
import { useEditorStore } from "../store/editor";
import { FiGitBranch, FiRefreshCw, FiTerminal } from "react-icons/fi";
import { useT } from "../lib/i18n";

interface Props {
  workspace: string;
  anchor: RefObject<HTMLElement>;
  onClose: () => void;
}

/** Branch popover anchored to the StatusBar branch button. Read-only by
 *  design: we list the current + recent branches and offer to "checkout in
 *  terminal" — meaning we paste `git checkout <name>` into the terminal and
 *  let the user hit Enter (or edit first). This avoids the JetBrains rabbit
 *  hole of "Smart Checkout / Force Checkout" for dirty working trees. */
export default function BranchPopover({ workspace, anchor, onClose }: Props) {
  const t = useT();
  const current = useGitBranch(workspace);
  const recent = useRecentBranches(workspace);
  const setTerminalOpen = useEditorStore((s) => s.setTerminalOpen);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape — same pattern as ContextMenu.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (anchor.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const id = window.setTimeout(() => {
      window.addEventListener("mousedown", onDoc);
      window.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      clearTimeout(id);
      window.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  const checkoutInTerminal = (branch: string) => {
    setTerminalOpen(true);
    // Defer one frame so the terminal mounts (its handle gets registered
    // synchronously inside its mount useEffect, which runs after this).
    requestAnimationFrame(() => {
      const h = getTerminalHandle();
      if (h) {
        h.paste(`git checkout ${branch}\n`);
      }
      onClose();
    });
  };

  // Position relative to the anchor — popover opens upward since we're
  // anchored to the status bar at the bottom of the window.
  const rect = anchor.current?.getBoundingClientRect();
  const left = rect ? Math.max(8, rect.right - 280) : 0;
  const bottom = rect ? window.innerHeight - rect.top + 4 : 32;

  return (
    <div
      ref={popoverRef}
      style={{
        position: "fixed",
        left,
        bottom,
        width: 280,
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        boxShadow: "var(--shadow-popup)",
        padding: "4px 0",
        fontSize: 13,
        zIndex: 2000,
      }}
    >
      <div
        style={{
          padding: "6px 12px 4px",
          fontSize: 11,
          color: "var(--text-soft)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        {t("git.popover.current")}
      </div>
      <div
        style={{
          padding: "4px 12px 8px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "var(--text)",
        }}
      >
        <FiGitBranch size={12} style={{ color: "var(--text-soft)" }} />
        <span className="truncate">{current}</span>
      </div>
      {recent.length > 0 && (
        <>
          <div style={{ height: 1, background: "var(--border)", margin: "2px 0" }} />
          <div
            style={{
              padding: "6px 12px 2px",
              fontSize: 11,
              color: "var(--text-soft)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            {t("git.popover.recent")}
          </div>
          {recent.map((b) => (
            <div
              key={b}
              onClick={() => checkoutInTerminal(b)}
              title={t("git.popover.checkoutHint", { branch: b })}
              style={{
                padding: "4px 12px",
                cursor: "pointer",
                color: "var(--text)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--hover-bg)")
              }
              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
            >
              <FiGitBranch size={11} style={{ color: "var(--text-soft)" }} />
              <span className="truncate" style={{ flex: 1 }}>
                {b}
              </span>
            </div>
          ))}
        </>
      )}
      <div style={{ height: 1, background: "var(--border)", margin: "2px 0" }} />
      <div
        onClick={() => {
          setTerminalOpen(true);
          requestAnimationFrame(() => {
            const h = getTerminalHandle();
            if (h) h.paste("git checkout ");
            onClose();
          });
        }}
        style={{
          padding: "6px 12px",
          cursor: "pointer",
          color: "var(--text)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "var(--hover-bg)")
        }
        onMouseLeave={(e) => (e.currentTarget.style.background = "")}
      >
        <FiTerminal size={12} style={{ color: "var(--text-soft)" }} />
        <span>{t("git.popover.checkoutInTerminal")}</span>
      </div>
      <div
        onClick={() => {
          refreshGit(workspace);
          onClose();
        }}
        style={{
          padding: "6px 12px",
          cursor: "pointer",
          color: "var(--text)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "var(--hover-bg)")
        }
        onMouseLeave={(e) => (e.currentTarget.style.background = "")}
      >
        <FiRefreshCw size={12} style={{ color: "var(--text-soft)" }} />
        <span>{t("git.popover.refresh")}</span>
      </div>
    </div>
  );
}
