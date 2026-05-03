import { memo } from "react";
import { useEditorStore } from "../store/editor";
import { useShallow } from "zustand/shallow";
import { useStatusInfoStore, detectEol } from "../lib/statusInfo";
import { detectLang } from "../lib/lang";
import { useT } from "../lib/i18n";
import LangIcon from "./LangIcon";
import { FiTerminal } from "react-icons/fi";

export default function StatusBar() {
  const t = useT();
  // Narrowed structural metadata: shallow-equal so we don't re-render when
  // unrelated tab fields change. Live editor metrics (line/col/totals/eol)
  // come from the dedicated statusInfo micro-store below — Editor pushes
  // them via CodeMirror's O(log n) line index, so StatusBar never has to
  // scan the doc itself even on multi-MB files.
  const meta = useEditorStore(
    useShallow((s) => {
      const active = s.tabs.find((x) => x.id === s.activeId);
      if (!active) return null;
      const isDiff = !!active.diff;
      return {
        id: active.id,
        isDiff,
        filePath: isDiff
          ? active.diff!.rightPath.replace(/^HEAD:/, "")
          : active.filePath,
        // Diff content never mutates after creation; capture it here and
        // skip the live subscription path entirely for diff tabs.
        diffContent: active.diff?.rightContent,
        dirty: !isDiff && active.content !== active.savedContent,
      };
    }),
  );
  const selectionLen = useEditorStore((s) => s.activeSelectionLength);
  const liveInfo = useStatusInfoStore((s) => s.info);
  // Diff tabs aren't backed by a CodeMirror Editor that pushes statusInfo,
  // so derive their stats directly from the (immutable) right-side content.
  // For non-diff tabs use the pushed values — already line-indexed by CM.
  const filePath = meta?.filePath ?? null;
  let line: number;
  let col: number;
  let lines: number;
  let chars: number;
  let eol: "CRLF" | "LF";
  if (meta?.isDiff) {
    const c = meta.diffContent ?? "";
    line = 1;
    col = 1;
    lines = c.split("\n").length;
    chars = c.length;
    eol = detectEol(c);
  } else {
    line = liveInfo.line;
    col = liveInfo.col;
    lines = liveInfo.totalLines;
    chars = liveInfo.charCount;
    eol = liveInfo.eol;
  }
  const dirty = meta?.dirty ?? false;
  const lang = detectLang(filePath);
  // Branch UI moved to TitleBar (JetBrains-style); StatusBar keeps only
  // editor-state info now.
  const terminalOpen = useEditorStore((s) => s.terminalOpen);
  const toggleTerminal = useEditorStore((s) => s.toggleTerminal);

  return (
    <div
      className="flex items-center justify-between select-none"
      style={{
        height: 22,
        padding: "0 10px",
        fontSize: 11,
        background: "var(--bg-soft)",
        borderTop: "1px solid var(--border)",
        color: "var(--text-soft)",
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {filePath && <LangIcon filePath={filePath} size={14} />}
        {filePath ? (
          <Breadcrumbs path={filePath} />
        ) : (
          <span className="truncate">{t("statusbar.untitled")}</span>
        )}
        {dirty && !meta?.isDiff && <span style={{ color: "var(--accent)" }}>●</span>}
      </div>
      <div className="flex items-center gap-4 flex-shrink-0">
        <span className="tabular-nums" title={t("statusbar.cursor")}>
          {t("statusbar.lnCol", { line: String(line), col: String(col) })}
          {selectionLen > 0 && (
            <span style={{ color: "var(--accent)", marginLeft: 6 }}>
              {t("statusbar.selected", { n: String(selectionLen) })}
            </span>
          )}
        </span>
        <span title={t("statusbar.eol")}>{eol}</span>
        <span title={t("statusbar.encoding")}>UTF-8</span>
        <span>{lang.label}</span>
        <span>
          {lines} {t("statusbar.lines")} · {chars} {t("statusbar.chars")}
        </span>
        <button
          onClick={toggleTerminal}
          title={t("statusbar.terminal")}
          className="deditor-btn"
          data-variant="ghost"
          data-pressed={terminalOpen ? "true" : undefined}
          style={{
            display: "inline-flex",
            alignItems: "center",
            background: terminalOpen ? "var(--bg-mute)" : "transparent",
            border: "none",
            color: terminalOpen ? "var(--text)" : "var(--text-soft)",
            padding: "0 5px",
            height: 18,
            cursor: "pointer",
            borderRadius: 3,
          }}
        >
          <FiTerminal size={11} />
        </button>
      </div>
    </div>
  );
}

/** IntelliJ-style breadcrumb path. Splits on / or \, shows last 3 segments
 *  with `…` to indicate truncation if there are more. The final segment (file
 *  name) is rendered in regular text color, parents in --text-soft. Hovering
 *  a segment lifts it to --text. Pure display — no click-to-navigate yet.
 *
 *  memo'd because StatusBar re-renders on every cursor move — Breadcrumbs
 *  always paints the same DOM as long as the file path didn't change. */
const Breadcrumbs = memo(function Breadcrumbs({ path }: { path: string }) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  const MAX = 3;
  const truncated = parts.length > MAX;
  const tail = truncated ? parts.slice(parts.length - MAX) : parts;
  return (
    <span
      className="truncate"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        minWidth: 0,
      }}
      title={path}
    >
      {truncated && <Crumb dim>…</Crumb>}
      {truncated && <Sep />}
      {tail.map((seg, i) => {
        const isLast = i === tail.length - 1;
        return (
          <span key={i} style={{ display: "inline-flex", alignItems: "center" }}>
            <Crumb dim={!isLast}>{seg}</Crumb>
            {!isLast && <Sep />}
          </span>
        );
      })}
    </span>
  );
});

function Crumb({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <span
      style={{
        color: dim ? "var(--text-soft)" : "var(--text)",
        cursor: "default",
        padding: "0 2px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Sep() {
  return (
    <span style={{ color: "var(--text-soft)", padding: "0 2px", opacity: 0.6 }}>
      ›
    </span>
  );
}
