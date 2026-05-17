import { useMemo } from "react";
import { useActiveTab, isTabDirty, useEditorStore } from "../store/editor";
import { detectLang } from "../lib/lang";
import { useT } from "../lib/i18n";
import LangIcon from "./LangIcon";

/** Build a sorted array of `\n` offsets in `text`. With this, line/col
 *  lookups become O(log lines) via binary search instead of O(offset)
 *  linear scan — the difference matters on big files where arrow-key
 *  cursor movement used to scan tens of KB of text per keystroke just to
 *  redraw the status bar. */
function buildNewlineOffsets(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) out.push(i);
  }
  return out;
}

/** O(log lines) line/col from a precomputed newline offset array.
 *  `breaks[i]` is the index of the i-th `\n`; line i+1 starts at breaks[i-1]+1. */
function offsetToLineColCached(
  breaks: number[],
  textLength: number,
  offset: number,
): { line: number; col: number } {
  const safe = Math.max(0, Math.min(offset, textLength));
  // Find the largest i such that breaks[i] < safe — that's the index of the
  // line break ending the previous line; line = i + 2, col = safe - breaks[i].
  let lo = 0;
  let hi = breaks.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (breaks[mid] < safe) lo = mid + 1;
    else hi = mid;
  }
  // lo = number of `\n` before `safe`. Line number is lo + 1 (1-based).
  const prevBreak = lo === 0 ? -1 : breaks[lo - 1];
  return { line: lo + 1, col: safe - prevBreak };
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
  // Newline offsets are derived per content change ONLY. Cursor moves don't
  // invalidate this cache, so arrow-key navigation in a big file no longer
  // re-scans tens of KB just to recompute line/col for the status bar.
  // EOL detection also keys off content only — same cache strategy.
  const newlineOffsets = useMemo(() => buildNewlineOffsets(content), [content]);
  const lines = newlineOffsets.length + 1;
  const chars = content.length;
  const lang = detectLang(filePath);
  const { line, col } = offsetToLineColCached(newlineOffsets, content.length, cursorOffset);
  const eol = useMemo(() => detectEol(content), [content]);

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
