import { FiZap, FiMinimize2 } from "react-icons/fi";
import { useT } from "../lib/i18n";
import { getActiveView } from "../lib/editorBridge";
import {
  compactJson,
  smartFormat,
  sortKeysFormat,
} from "../lib/jsonFormat";

/**
 * Toolbar shown above the editor for .json / .jsonc / .json5 files. Mirrors
 * the layout of MarkdownToolbar so the eye lands on the same button area
 * regardless of file type.
 */
export default function JsonToolbar() {
  const t = useT();

  const apply = (transform: (text: string) => string) => {
    const view = getActiveView();
    if (!view) return;
    const current = view.state.doc.toString();
    if (!current.trim()) return;
    let next: string;
    try {
      next = transform(current);
    } catch (err) {
      alert(
        t("json.formatFailed", {
          err: err instanceof Error ? err.message : String(err),
        }),
      );
      return;
    }
    if (next === current) return;
    // Keep the cursor at the same character offset, clamped to the new doc.
    const oldPos = view.state.selection.main.head;
    const newPos = Math.min(oldPos, next.length);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: next },
      selection: { anchor: newPos },
    });
    view.focus();
  };

  return (
    <div
      className="flex items-center gap-1 px-2 select-none"
      style={{
        height: 32,
        background: "var(--bg-soft)",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        overflowX: "auto",
      }}
    >
      <Btn
        title={t("json.formatTip")}
        onClick={() => apply(smartFormat)}
        primary
      >
        <FiZap size={13} />
        <span style={{ marginLeft: 4 }}>{t("json.format")}</span>
      </Btn>
      <Divider />
      <Btn title={t("json.compactTip")} onClick={() => apply(compactJson)}>
        <FiMinimize2 size={13} />
        <span style={{ marginLeft: 4 }}>{t("json.compact")}</span>
      </Btn>
      <Btn title={t("json.sortKeysTip")} onClick={() => apply(sortKeysFormat)}>
        <span style={{ fontWeight: 600 }}>A↓Z</span>
        <span style={{ marginLeft: 6 }}>{t("json.sortKeys")}</span>
      </Btn>
    </div>
  );
}

function Btn({
  children,
  title,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        height: 24,
        padding: "0 10px",
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 4,
        background: primary ? "var(--accent)" : "transparent",
        border: primary ? "none" : "none",
        cursor: "pointer",
        color: primary ? "white" : "var(--text)",
        fontSize: 12,
        fontWeight: primary ? 600 : 500,
      }}
      onMouseEnter={(e) => {
        if (!primary) e.currentTarget.style.background = "var(--bg-mute)";
      }}
      onMouseLeave={(e) => {
        if (!primary) e.currentTarget.style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return (
    <div
      style={{
        width: 1,
        height: 14,
        background: "var(--border)",
        margin: "0 4px",
      }}
    />
  );
}
