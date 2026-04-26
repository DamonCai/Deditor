import { useEffect, useRef } from "react";
import { useEditorStore } from "../store/editor";
import { SHORTCUTS, type ShortcutMeta } from "../lib/shortcuts";
import { useT } from "../lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
}

const GROUP_ORDER: ShortcutMeta["group"][] = ["file", "nav", "editor"];

export default function SettingsDialog({ open, onClose }: Props) {
  const t = useT();
  const shortcuts = useEditorStore((s) => s.shortcuts);
  const setShortcutEnabled = useEditorStore((s) => s.setShortcutEnabled);
  const resetShortcuts = useEditorStore((s) => s.resetShortcuts);
  const softWrap = useEditorStore((s) => s.softWrap);
  const setSoftWrap = useEditorStore((s) => s.setSoftWrap);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => closeBtnRef.current?.focus());
  }, [open]);

  if (!open) return null;

  const grouped = GROUP_ORDER.map((g) => ({
    group: g,
    items: SHORTCUTS.filter((s) => s.group === g),
  }));

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
          width: "min(640px, 92vw)",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-soft)",
            fontSize: 14,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>{t("settings.title")}</span>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close"
            style={{
              border: "none",
              background: "transparent",
              fontSize: 18,
              lineHeight: 1,
              color: "var(--text-soft)",
              cursor: "pointer",
              padding: "0 4px",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: "12px 16px", flex: 1, overflowY: "auto" }}>
          {/* Editor section */}
          <section style={{ marginBottom: 16 }}>
            <h3
              style={{
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                color: "var(--text-soft)",
                margin: "0 0 6px",
                fontWeight: 600,
              }}
            >
              {t("settings.editor.heading")}
            </h3>
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 6,
                overflow: "hidden",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 12px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={softWrap}
                  onChange={(e) => setSoftWrap(e.target.checked)}
                  style={{ flexShrink: 0 }}
                />
                <span style={{ fontSize: 13, color: "var(--text)", flex: 1 }}>
                  {t("settings.editor.softWrap")}
                </span>
              </label>
            </div>
          </section>

          <div
            style={{
              fontSize: 13,
              color: "var(--text-soft)",
              marginBottom: 12,
            }}
          >
            {t("settings.shortcuts.intro")}
          </div>

          {grouped.map(({ group, items }) => (
            <section key={group} style={{ marginBottom: 16 }}>
              <h3
                style={{
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                  color: "var(--text-soft)",
                  margin: "0 0 6px",
                  fontWeight: 600,
                }}
              >
                {t(`settings.shortcuts.group.${group}`)}
              </h3>
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  overflow: "hidden",
                }}
              >
                {items.map((s, i) => {
                  const enabled = shortcuts[s.id] !== false;
                  return (
                    <label
                      key={s.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "8px 12px",
                        borderTop: i === 0 ? undefined : "1px solid var(--border)",
                        cursor: "pointer",
                        background: enabled ? undefined : "var(--bg-soft)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => setShortcutEnabled(s.id, e.target.checked)}
                        style={{ flexShrink: 0 }}
                      />
                      <span
                        style={{
                          fontFamily: "var(--font-mono, ui-monospace, monospace)",
                          fontSize: 12,
                          background: "var(--bg-mute)",
                          padding: "2px 6px",
                          borderRadius: 4,
                          color: enabled ? "var(--text)" : "var(--text-soft)",
                          flexShrink: 0,
                          minWidth: 130,
                          textAlign: "center",
                          textDecoration: enabled ? undefined : "line-through",
                        }}
                      >
                        {s.display}
                      </span>
                      <span
                        style={{
                          fontSize: 13,
                          color: enabled ? "var(--text)" : "var(--text-soft)",
                          flex: 1,
                        }}
                      >
                        {t(s.labelKey)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          ))}

          <div
            style={{
              fontSize: 12,
              color: "var(--text-soft)",
              marginTop: 8,
              padding: "8px 12px",
              background: "var(--bg-soft)",
              border: "1px solid var(--border)",
              borderRadius: 6,
            }}
          >
            {t("settings.shortcuts.builtinNote")}
          </div>
        </div>

        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--bg-soft)",
          }}
        >
          <button
            onClick={resetShortcuts}
            style={{
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
              padding: "5px 12px",
              borderRadius: 4,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {t("settings.reset")}
          </button>
          <button
            onClick={onClose}
            style={{
              border: "1px solid var(--accent)",
              background: "var(--accent)",
              color: "#fff",
              padding: "5px 16px",
              borderRadius: 4,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {t("settings.done")}
          </button>
        </div>
      </div>
    </div>
  );
}
