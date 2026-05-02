import { useEffect, useMemo, useState } from "react";
import { computeDiff, diffWords, type DiffRow } from "../lib/diff";
import LangIcon from "./LangIcon";
import { useT } from "../lib/i18n";
import type { DiffSpec } from "../store/editor";
import { useEditorStore } from "../store/editor";
import { detectLang } from "../lib/lang";
import { tokenizeLines, type ShikiTok } from "../lib/highlight";

interface Props {
  spec: DiffSpec;
}

const ROW_PAD = "0 8px";

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

// ---------------------------------------------------------------------------
// Fold algorithm — JetBrains "Collapse unchanged fragments". Long runs of
// `eq` rows collapse to one placeholder; the user expands by clicking it.
//
// Threshold = first `threshold` consecutive eq rows trigger a fold; we keep
// `context` lines on either side so a hunk's surroundings are still visible.

type Chunk =
  | { kind: "rows"; rows: DiffRow[] }
  | { kind: "fold"; count: number; idx: number };

function buildChunks(
  rows: DiffRow[],
  threshold: number,
  context: number,
  expanded: Set<number>,
): Chunk[] {
  if (rows.length === 0) return [];
  if (!isFinite(threshold)) return [{ kind: "rows", rows }];
  const chunks: Chunk[] = [];
  // Run scanner: collect contiguous segments of (eq) vs (not eq), then for
  // long eq runs — except those at the very ends, which we leave intact —
  // emit prefix+context, fold, suffix+context.
  let i = 0;
  let foldIdx = 0;
  while (i < rows.length) {
    if (rows[i].changeType !== "eq") {
      // Walk a non-eq run and emit as a single rows chunk.
      let j = i;
      while (j < rows.length && rows[j].changeType !== "eq") j++;
      pushRows(chunks, rows.slice(i, j));
      i = j;
      continue;
    }
    let j = i;
    while (j < rows.length && rows[j].changeType === "eq") j++;
    const runLen = j - i;
    if (runLen <= threshold) {
      // Not long enough — render straight.
      pushRows(chunks, rows.slice(i, j));
    } else if (expanded.has(foldIdx)) {
      // User already expanded this fold — render in full.
      pushRows(chunks, rows.slice(i, j));
      foldIdx++;
    } else {
      const isFirst = i === 0;
      const isLast = j === rows.length;
      const head = isFirst ? 0 : context;
      const tail = isLast ? 0 : context;
      const hidden = runLen - head - tail;
      if (hidden <= 0) {
        pushRows(chunks, rows.slice(i, j));
      } else {
        if (head > 0) pushRows(chunks, rows.slice(i, i + head));
        chunks.push({ kind: "fold", count: hidden, idx: foldIdx });
        if (tail > 0) pushRows(chunks, rows.slice(j - tail, j));
        foldIdx++;
      }
    }
    i = j;
  }
  return chunks;
}

function pushRows(chunks: Chunk[], rows: DiffRow[]): void {
  if (rows.length === 0) return;
  // Coalesce adjacent rows chunks.
  const last = chunks[chunks.length - 1];
  if (last && last.kind === "rows") {
    last.rows.push(...rows);
  } else {
    chunks.push({ kind: "rows", rows });
  }
}

function FoldRow({
  cols,
  count,
  onClick,
}: {
  cols: number;
  count: number;
  onClick: () => void;
}) {
  const t = useT();
  return (
    <tr>
      <td
        colSpan={cols}
        onClick={onClick}
        title={t("diff.expandHidden", { n: String(count) })}
        style={{
          padding: "4px 12px",
          textAlign: "center",
          color: "var(--text-soft)",
          background: "var(--bg-soft)",
          borderTop: "1px dashed var(--border)",
          borderBottom: "1px dashed var(--border)",
          cursor: "pointer",
          userSelect: "none",
          fontSize: 11,
          fontStyle: "italic",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "var(--hover-bg)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = "var(--bg-soft)")
        }
      >
        ▾ {t("diff.expandHidden", { n: String(count) })}
      </td>
    </tr>
  );
}

/** Side-by-side OR unified diff view, with JetBrains-style toolbar:
 *  viewer mode toggle, ignore-whitespace dropdown, highlight-words toggle.
 *  All preferences persist globally in store. */
export default function DiffView({ spec }: Props) {
  const t = useT();
  const viewMode = useEditorStore((s) => s.diffViewMode);
  const setViewMode = useEditorStore((s) => s.setDiffViewMode);
  const whitespace = useEditorStore((s) => s.diffIgnoreWhitespace);
  const setWhitespace = useEditorStore((s) => s.setDiffIgnoreWhitespace);
  const highlightWords = useEditorStore((s) => s.diffHighlightWords);
  const setHighlightWords = useEditorStore((s) => s.setDiffHighlightWords);
  const collapseUnchanged = useEditorStore((s) => s.diffCollapseUnchanged);
  const setCollapseUnchanged = useEditorStore(
    (s) => s.setDiffCollapseUnchanged,
  );
  const theme = useEditorStore((s) => s.theme);
  // Indices of fold placeholders the user explicitly expanded. Reset when
  // the row list changes (new file / whitespace toggle re-runs the diff).
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const { rows, stats } = useMemo(
    () => computeDiff(spec.leftContent, spec.rightContent, whitespace),
    [spec.leftContent, spec.rightContent, whitespace],
  );
  // Whenever the row set changes, drop expanded fold state — the previous
  // indices no longer line up with the new chunks anyway.
  useEffect(() => {
    setExpanded(new Set());
  }, [rows]);

  // Build chunked view: long runs of `eq` rows collapse into placeholders.
  // Each fold gets a stable index from its run start; users expand by
  // index into `expanded`.
  const chunks = useMemo(
    () => buildChunks(rows, collapseUnchanged ? 6 : Infinity, 3, expanded),
    [rows, collapseUnchanged, expanded],
  );

  const onExpand = (idx: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });

  // Shiki tokenization. Detect language from the right side (or left side
  // if right is missing — happens for pure deletions). Empty arrays mean
  // "still loading" — renderer falls back to plain text gracefully.
  const langId = useMemo(() => {
    const path = spec.rightPath || spec.leftPath;
    return detectLang(path).shiki;
  }, [spec.rightPath, spec.leftPath]);
  const themeId = theme === "dark" ? "one-dark-pro" : "github-light";
  const [leftTokens, setLeftTokens] = useState<ShikiTok[][]>([]);
  const [rightTokens, setRightTokens] = useState<ShikiTok[][]>([]);
  // Bypass Shiki for huge files. Tokenizing 200KB+ blocks the main thread
  // for hundreds of ms. Plain text renders instantly; the user can still
  // read the diff structure (the +/-/M backgrounds + word-diff overlay
  // already convey the change).
  const SHIKI_MAX_BYTES = 200 * 1024;
  const SHIKI_MAX_LINES = 5000;
  const tooBig = (s: string) =>
    s.length > SHIKI_MAX_BYTES || (s.match(/\n/g)?.length ?? 0) > SHIKI_MAX_LINES;
  useEffect(() => {
    let cancelled = false;
    if (tooBig(spec.leftContent)) {
      setLeftTokens([]);
    } else {
      void tokenizeLines(spec.leftContent, langId, themeId)
        .then((toks) => {
          if (!cancelled) setLeftTokens(toks);
        })
        .catch(() => {
          if (!cancelled) setLeftTokens([]);
        });
    }
    if (tooBig(spec.rightContent)) {
      setRightTokens([]);
    } else {
      void tokenizeLines(spec.rightContent, langId, themeId)
        .then((toks) => {
          if (!cancelled) setRightTokens(toks);
        })
        .catch(() => {
          if (!cancelled) setRightTokens([]);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [spec.leftContent, spec.rightContent, langId, themeId]);

  const leftName = basename(spec.leftPath);
  const rightName = basename(spec.rightPath);

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "var(--bg)" }}>
      {/* Header: paths + stats */}
      <div
        className="flex items-center px-3 text-xs"
        style={{
          height: 32,
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-soft)",
          color: "var(--text-soft)",
          flexShrink: 0,
          gap: 12,
        }}
      >
        <div className="flex items-center gap-1 min-w-0 flex-1" title={spec.leftPath}>
          <LangIcon filePath={spec.leftPath} size={14} />
          <span className="truncate">{leftName}</span>
        </div>
        <span style={{ color: "var(--text-soft)" }}>↔</span>
        <div className="flex items-center gap-1 min-w-0 flex-1" title={spec.rightPath}>
          <LangIcon filePath={spec.rightPath} size={14} />
          <span className="truncate">{rightName}</span>
        </div>
        <span className="tabular-nums" style={{ color: "#16a34a" }}>+{stats.addedLines}</span>
        <span className="tabular-nums" style={{ color: "#dc2626" }}>−{stats.removedLines}</span>
        <span className="tabular-nums" style={{ color: "var(--text-soft)" }}>~{stats.modifiedLines}</span>
      </div>

      {/* Toolbar */}
      <div
        className="flex items-center px-3"
        style={{
          height: 28,
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-soft)",
          fontSize: 11,
          color: "var(--text-soft)",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <select
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value as "side" | "unified")}
          style={selectStyle}
          title={t(`diff.viewer.${viewMode}`)}
        >
          <option value="side">{t("diff.viewer.side")}</option>
          <option value="unified">{t("diff.viewer.unified")}</option>
        </select>
        <select
          value={whitespace}
          onChange={(e) =>
            setWhitespace(e.target.value as "none" | "leading" | "all")
          }
          style={selectStyle}
        >
          <option value="none">{t("diff.whitespace.none")}</option>
          <option value="leading">{t("diff.whitespace.leading")}</option>
          <option value="all">{t("diff.whitespace.all")}</option>
        </select>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={highlightWords}
            onChange={(e) => setHighlightWords(e.target.checked)}
          />
          {t("diff.highlightWords")}
        </label>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={collapseUnchanged}
            onChange={(e) => setCollapseUnchanged(e.target.checked)}
          />
          {t("diff.collapseUnchanged")}
        </label>
      </div>

      {/* Diff body */}
      <div className="flex-1 min-h-0 overflow-auto">
        {rows.length === 0 ? (
          <div className="p-6 text-sm" style={{ color: "var(--text-soft)" }}>
            {t("diff.identical")}
          </div>
        ) : viewMode === "side" ? (
          <SideBySide
            chunks={chunks}
            highlightWords={highlightWords}
            leftTokens={leftTokens}
            rightTokens={rightTokens}
            onExpand={onExpand}
          />
        ) : (
          <Unified
            chunks={chunks}
            highlightWords={highlightWords}
            leftTokens={leftTokens}
            rightTokens={rightTokens}
            onExpand={onExpand}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Side-by-side renderer

function SideBySide({
  chunks,
  highlightWords,
  leftTokens,
  rightTokens,
  onExpand,
}: {
  chunks: Chunk[];
  highlightWords: boolean;
  leftTokens: ShikiTok[][];
  rightTokens: ShikiTok[][];
  onExpand: (idx: number) => void;
}) {
  return (
    <table
      style={{
        borderCollapse: "collapse",
        width: "100%",
        tableLayout: "fixed",
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        fontSize: 12,
        lineHeight: "18px",
      }}
    >
      <colgroup>
        <col style={{ width: 48 }} />
        <col style={{ width: "calc(50% - 48px)" }} />
        <col style={{ width: 48 }} />
        <col style={{ width: "calc(50% - 48px)" }} />
      </colgroup>
      <tbody>
        {chunks.map((chunk, ci) =>
          chunk.kind === "fold" ? (
            <FoldRow
              key={`fold-${ci}`}
              cols={4}
              count={chunk.count}
              onClick={() => onExpand(chunk.idx)}
            />
          ) : (
            chunk.rows.map((row, i) => (
              <SideRow
                key={`${ci}-${i}`}
                row={row}
                highlightWords={highlightWords}
                leftTokens={leftTokens}
                rightTokens={rightTokens}
              />
            ))
          ),
        )}
      </tbody>
    </table>
  );
}

function SideRow({
  row,
  highlightWords,
  leftTokens,
  rightTokens,
}: {
  row: DiffRow;
  highlightWords: boolean;
  leftTokens: ShikiTok[][];
  rightTokens: ShikiTok[][];
}) {
  const leftBg = bgFor(row, "left");
  const rightBg = bgFor(row, "right");
  // For "mod" rows when highlightWords is on, prefer the word-diff overlay
  // (red/green char tints) — it's more informative than syntax tokens when
  // the user just wants to spot what actually changed in the line.
  const useWord =
    highlightWords && row.changeType === "mod" && row.left != null && row.right != null;
  const wordSegs = useWord ? diffWords(row.left!, row.right!) : null;
  const renderLeft = useWord
    ? renderWordSegs(wordSegs!.left, "del")
    : renderShikiLine(row.left, row.leftLineNum, leftTokens);
  const renderRight = useWord
    ? renderWordSegs(wordSegs!.right, "add")
    : renderShikiLine(row.right, row.rightLineNum, rightTokens);
  return (
    <tr>
      <td style={{ ...lineNumStyle, background: leftBg }}>{row.leftLineNum ?? ""}</td>
      <td style={{ ...cellStyle, background: leftBg }}>{renderLeft}</td>
      <td style={{ ...lineNumStyle, background: rightBg }}>{row.rightLineNum ?? ""}</td>
      <td style={{ ...cellStyle, background: rightBg }}>{renderRight}</td>
    </tr>
  );
}

/** Render one line using its Shiki tokens. Falls back to plain text when
 *  Shiki hasn't loaded yet (or the line index is past the tokenized array,
 *  which can happen briefly when `value` updates ahead of the tokenizer). */
function renderShikiLine(
  text: string | null,
  lineNum: number | null,
  tokens: ShikiTok[][],
): React.ReactNode {
  if (text == null) return "";
  if (text.length === 0) return " ";
  if (lineNum == null) return text;
  const lineTokens = tokens[lineNum - 1];
  if (!lineTokens) return text;
  // Defensive: when normalization (whitespace mode) altered the original
  // line, the recorded text may differ from what shiki saw. Compare and
  // fall back to plain text rather than render mismatched colors.
  const tokText = lineTokens.map((t) => t.content).join("");
  if (tokText !== text) return text;
  return lineTokens.map((tok, i) => (
    <span key={i} style={tok.color ? { color: tok.color } : undefined}>
      {tok.content}
    </span>
  ));
}

// ---------------------------------------------------------------------------
// Unified renderer — single column, lines stacked with -/+ prefix.

function Unified({
  chunks,
  highlightWords,
  leftTokens,
  rightTokens,
  onExpand,
}: {
  chunks: Chunk[];
  highlightWords: boolean;
  leftTokens: ShikiTok[][];
  rightTokens: ShikiTok[][];
  onExpand: (idx: number) => void;
}) {
  // For unified, "mod" rows expand into two visual rows: a deleted (-) and
  // an added (+). eq/del/add stay one row each.
  return (
    <table
      style={{
        borderCollapse: "collapse",
        width: "100%",
        tableLayout: "fixed",
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        fontSize: 12,
        lineHeight: "18px",
      }}
    >
      <colgroup>
        <col style={{ width: 36 }} />
        <col style={{ width: 36 }} />
        <col style={{ width: 18 }} />
        <col />
      </colgroup>
      <tbody>
        {chunks.map((chunk, ci) =>
          chunk.kind === "fold" ? (
            <FoldRow
              key={`fold-${ci}`}
              cols={4}
              count={chunk.count}
              onClick={() => onExpand(chunk.idx)}
            />
          ) : (
            <UnifiedChunk
              key={`u-${ci}`}
              rows={chunk.rows}
              highlightWords={highlightWords}
              leftTokens={leftTokens}
              rightTokens={rightTokens}
            />
          ),
        )}
      </tbody>
    </table>
  );
}

function UnifiedChunk({
  rows,
  highlightWords,
  leftTokens,
  rightTokens,
}: {
  rows: DiffRow[];
  highlightWords: boolean;
  leftTokens: ShikiTok[][];
  rightTokens: ShikiTok[][];
}) {
  return (
    <>{buildUnifiedRows(rows, highlightWords, leftTokens, rightTokens)}</>
  );
}

function buildUnifiedRows(
  rows: DiffRow[],
  highlightWords: boolean,
  leftTokens: ShikiTok[][],
  rightTokens: ShikiTok[][],
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  rows.forEach((row, i) => {
    if (row.changeType === "eq") {
      out.push(
        <UnifiedRow
          key={`${i}-eq`}
          leftNum={row.leftLineNum}
          rightNum={row.rightLineNum}
          marker=" "
          text={renderShikiLine(row.right ?? row.left, row.rightLineNum ?? row.leftLineNum, rightTokens.length > 0 ? rightTokens : leftTokens)}
          bg="transparent"
        />,
      );
      return;
    }
    if (row.changeType === "del") {
      out.push(
        <UnifiedRow
          key={`${i}-d`}
          leftNum={row.leftLineNum}
          rightNum={null}
          marker="-"
          text={renderShikiLine(row.left, row.leftLineNum, leftTokens)}
          bg="var(--diff-del-bg)"
        />,
      );
      return;
    }
    if (row.changeType === "add") {
      out.push(
        <UnifiedRow
          key={`${i}-a`}
          leftNum={null}
          rightNum={row.rightLineNum}
          marker="+"
          text={renderShikiLine(row.right, row.rightLineNum, rightTokens)}
          bg="var(--diff-add-bg)"
        />,
      );
      return;
    }
    // mod — emit a "-" then "+" row. Word-highlight overlay wins when on,
    // otherwise we fall back to syntax-highlighted tokens.
    const useWord =
      highlightWords && row.left != null && row.right != null;
    const segs = useWord ? diffWords(row.left!, row.right!) : null;
    if (row.left != null) {
      out.push(
        <UnifiedRow
          key={`${i}-md`}
          leftNum={row.leftLineNum}
          rightNum={null}
          marker="-"
          text={
            segs
              ? renderWordSegs(segs.left, "del")
              : renderShikiLine(row.left, row.leftLineNum, leftTokens)
          }
          bg="var(--diff-del-bg)"
        />,
      );
    }
    if (row.right != null) {
      out.push(
        <UnifiedRow
          key={`${i}-ma`}
          leftNum={null}
          rightNum={row.rightLineNum}
          marker="+"
          text={
            segs
              ? renderWordSegs(segs.right, "add")
              : renderShikiLine(row.right, row.rightLineNum, rightTokens)
          }
          bg="var(--diff-add-bg)"
        />,
      );
    }
  });
  return out;
}

function UnifiedRow({
  leftNum,
  rightNum,
  marker,
  text,
  bg,
}: {
  leftNum: number | null;
  rightNum: number | null;
  marker: string;
  text: React.ReactNode;
  bg: string;
}) {
  return (
    <tr>
      <td style={{ ...lineNumStyle, background: bg }}>{leftNum ?? ""}</td>
      <td style={{ ...lineNumStyle, background: bg }}>{rightNum ?? ""}</td>
      <td
        style={{
          ...lineNumStyle,
          background: bg,
          color:
            marker === "+"
              ? "#16a34a"
              : marker === "-"
                ? "#dc2626"
                : "var(--text-soft)",
          textAlign: "center",
        }}
      >
        {marker}
      </td>
      <td style={{ ...cellStyle, background: bg }}>{text}</td>
    </tr>
  );
}

// ---------------------------------------------------------------------------

function bgFor(row: DiffRow, side: "left" | "right"): string {
  if (row.changeType === "eq") return "transparent";
  if (row.changeType === "del")
    return side === "left" ? "var(--diff-del-bg)" : "var(--diff-empty-bg)";
  if (row.changeType === "add")
    return side === "left" ? "var(--diff-empty-bg)" : "var(--diff-add-bg)";
  if (side === "left")
    return row.left == null ? "var(--diff-empty-bg)" : "var(--diff-del-bg)";
  return row.right == null ? "var(--diff-empty-bg)" : "var(--diff-add-bg)";
}

/** Render an inline sequence of word segments — eq segments stay neutral,
 *  changed segments get a stronger background tint within the row. */
function renderWordSegs(
  segs: { text: string; kind: "eq" | "del" | "add" }[],
  defaultChange: "del" | "add",
): React.ReactNode {
  return segs.map((s, i) => {
    if (s.kind === "eq") return <span key={i}>{s.text}</span>;
    const isChange = s.kind === defaultChange;
    return (
      <span
        key={i}
        style={{
          background: isChange
            ? defaultChange === "del"
              ? "rgba(220, 38, 38, 0.35)"
              : "rgba(22, 163, 74, 0.35)"
            : "transparent",
          borderRadius: 2,
        }}
      >
        {s.text}
      </span>
    );
  });
}

const lineNumStyle: React.CSSProperties = {
  textAlign: "right",
  padding: ROW_PAD,
  color: "var(--text-soft)",
  userSelect: "none",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
  borderRight: "1px solid var(--border)",
};

const cellStyle: React.CSSProperties = {
  padding: ROW_PAD,
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  color: "var(--text)",
};

const selectStyle: React.CSSProperties = {
  background: "var(--bg)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 3,
  padding: "1px 4px",
  fontSize: 11,
  outline: "none",
};
