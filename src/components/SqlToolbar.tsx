import { logError } from "../lib/logger";
import { showError } from "../lib/feedback";
import { useState } from "react";
import { FiAlignRight, FiAlignLeft, FiAlignJustify, FiMinimize2 } from "react-icons/fi";
import { useT } from "../lib/i18n";
import { getActiveView } from "../lib/editorBridge";
import { Button } from "./ui/Button";
import { formatSql, type SqlStyle } from "../lib/sqlFormat";

/**
 * Toolbar shown above the editor for .sql files. Mirrors JsonToolbar's layout
 * and interaction (in-place replace + cursor preserved). The three buttons are
 * peer layout styles, so they share one visual treatment (no primary, no
 * divider); the most-recently-applied one stays highlighted (pressed) as click
 * feedback. The transform is async because sql-formatter loads lazily.
 */
export default function SqlToolbar() {
  const t = useT();
  // Guard against double-firing while the (lazy) formatter chunk loads.
  const [busy, setBusy] = useState(false);
  // Last-applied style — kept highlighted so a click visibly changes state.
  const [active, setActive] = useState<SqlStyle | null>(null);

  const apply = async (style: SqlStyle) => {
    if (busy) return;
    const view = getActiveView();
    if (!view) return;
    const current = view.state.doc.toString();
    if (!current.trim()) return;
    setBusy(true);
    let next: string;
    try {
      next = await formatSql(current, style);
    } catch (err) {
      logError("SQL format failed", err);
      void showError(
        t("sql.formatFailed", {
          err: err instanceof Error ? err.message : String(err),
        }),
      );
      return;
    } finally {
      setBusy(false);
    }
    // The active view may have changed (tab switch) during the await; re-read
    // and bail if the document is no longer the one we formatted.
    const v = getActiveView();
    if (!v || v.state.doc.toString() !== current) return;
    setActive(style);
    if (next === current) return;
    const oldPos = v.state.selection.main.head;
    const newPos = Math.min(oldPos, next.length);
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: next },
      selection: { anchor: newPos },
    });
    v.focus();
  };

  return (
    <div
      className="document-toolbar select-none"
      style={{
        flexShrink: 0,
        overflowX: "auto",
        whiteSpace: "nowrap",
      }}
    >
      <Btn
        title={t("sql.riverTip")}
        onClick={() => apply("river")}
        pressed={active === "river"}
      >
        <FiAlignRight size={13} />
        <span style={{ marginLeft: 4 }}>{t("sql.river")}</span>
      </Btn>
      <Btn
        title={t("sql.tabularTip")}
        onClick={() => apply("tabular")}
        pressed={active === "tabular"}
      >
        <FiAlignLeft size={13} />
        <span style={{ marginLeft: 4 }}>{t("sql.tabular")}</span>
      </Btn>
      <Btn
        title={t("sql.compactTip")}
        onClick={() => apply("compact")}
        pressed={active === "compact"}
      >
        <FiAlignJustify size={13} />
        <span style={{ marginLeft: 4 }}>{t("sql.compact")}</span>
      </Btn>
      <Btn
        title={t("sql.minifyTip")}
        onClick={() => apply("minify")}
        pressed={active === "minify"}
      >
        <FiMinimize2 size={13} />
        <span style={{ marginLeft: 4 }}>{t("sql.minify")}</span>
      </Btn>
    </div>
  );
}

function Btn({
  children,
  title,
  onClick,
  pressed,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      title={title}
      onClick={onClick}
      pressed={pressed}
      style={{
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
        whiteSpace: "nowrap",
        color: "var(--text)",
      }}
    >
      {children}
    </Button>
  );
}
