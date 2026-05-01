import { useActiveTab, isTabDirty, useEditorStore } from "../store/editor";
import { detectLang } from "../lib/lang";
import { useT } from "../lib/i18n";
import LangIcon from "./LangIcon";

/** Convert a flat char offset into 1-based (line, column). Counts UTF-16
 *  code units, which is what CodeMirror's selection offsets use. Tab is
 *  treated as one column — Sublime / VSCode show actual column number, not
 *  visual column, by default, and matching that keeps the math cheap. */
function offsetToLineCol(text: string, offset: number): { line: number; col: number } {
  const safe = Math.max(0, Math.min(offset, text.length));
  let line = 1;
  let lastBreak = -1;
  for (let i = 0; i < safe; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      line++;
      lastBreak = i;
    }
  }
  return { line, col: safe - lastBreak };
}

/** Detect dominant line ending. Uses the first occurrence so a file freshly
 *  read from disk reports its on-disk EOL even if the user has since added
 *  lines via the editor (CodeMirror inserts \n). */
function detectEol(text: string): "CRLF" | "LF" {
  const firstNl = text.indexOf("\n");
  if (firstNl > 0 && text.charCodeAt(firstNl - 1) === 13 /* \r */) return "CRLF";
  return "LF";
}

export default function StatusBar() {
  const t = useT();
  const active = useActiveTab();
  const cursorOffset = useEditorStore((s) =>
    active ? s.tabPositions[active.id]?.cursor ?? 0 : 0,
  );
  const selectionLen = useEditorStore((s) => s.activeSelectionLength);
  const filePath = active?.filePath ?? null;
  const content = active?.content ?? "";
  const dirty = active ? isTabDirty(active) : false;
  const lines = content.split("\n").length;
  const chars = content.length;
  const lang = detectLang(filePath);
  const { line, col } = offsetToLineCol(content, cursorOffset);
  const eol = detectEol(content);

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
        {dirty && <span style={{ color: "var(--accent)" }}>●</span>}
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
      </div>
    </div>
  );
}

/** IntelliJ-style breadcrumb path. Splits on / or \, shows last 3 segments
 *  with `…` to indicate truncation if there are more. The final segment (file
 *  name) is rendered in regular text color, parents in --text-soft. Hovering
 *  a segment lifts it to --text. Pure display — no click-to-navigate yet. */
function Breadcrumbs({ path }: { path: string }) {
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
}

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
