import type { KeyBinding } from "@codemirror/view";
import type { EditorView } from "@codemirror/view";
import type { EditorState, Line } from "@codemirror/state";

// A line is treated as a Markdown table row if it has at least one `|`
// flanked by other content. We don't require the leading/trailing `|`
// (some authors omit them) — but the row must have at least one inner pipe.
function isTableLine(text: string): boolean {
  const t = text.trim();
  return t.includes("|") && /^\|?.*\|.*\|?$/.test(t) && t.length > 1;
}

interface ParsedRow {
  cells: string[];
  /** `:--|:--:|--:` style alignment row. */
  isSeparator: boolean;
  /** Per-column alignment for separator rows. "l" / "c" / "r". */
  alignments?: ("l" | "c" | "r")[];
}

function parseRow(text: string): ParsedRow | null {
  let body = text.trim();
  if (body.startsWith("|")) body = body.slice(1);
  if (body.endsWith("|")) body = body.slice(0, -1);
  const cells = body.split("|").map((c) => c.trim());
  const sepCells = cells.map((c) => /^(:?-+:?)$/.test(c));
  if (sepCells.length > 0 && sepCells.every(Boolean)) {
    const alignments = cells.map<"l" | "c" | "r">((c) => {
      const left = c.startsWith(":");
      const right = c.endsWith(":");
      return left && right ? "c" : right ? "r" : "l";
    });
    return { cells, isSeparator: true, alignments };
  }
  return { cells, isSeparator: false };
}

/** Display-width estimate: CJK / fullwidth chars count as 2, others as 1. Good
 *  enough for column padding so monospace tables line up in CJK + ASCII mixes. */
function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    // CJK Unified, Hiragana/Katakana, Hangul, Fullwidth/Halfwidth Forms,
    // CJK Symbols, Yi Syllables. Coarse but covers the common cases.
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0x303e) ||
      (code >= 0x3041 && code <= 0x33ff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0xa000 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6);
    w += wide ? 2 : 1;
  }
  return w;
}

function pad(s: string, width: number, align: "l" | "c" | "r"): string {
  const w = displayWidth(s);
  const slack = Math.max(0, width - w);
  if (align === "r") return " ".repeat(slack) + s;
  if (align === "c") {
    const left = Math.floor(slack / 2);
    return " ".repeat(left) + s + " ".repeat(slack - left);
  }
  return s + " ".repeat(slack);
}

interface TableRange {
  fromLine: number;
  toLine: number;
}

function findTableRange(state: EditorState, lineNumber: number): TableRange | null {
  if (!isTableLine(state.doc.line(lineNumber).text)) return null;
  let from = lineNumber;
  while (from > 1 && isTableLine(state.doc.line(from - 1).text)) from--;
  let to = lineNumber;
  while (to < state.doc.lines && isTableLine(state.doc.line(to + 1).text)) to++;
  if (from === to) return null;
  return { fromLine: from, toLine: to };
}

/** Re-format the table containing the cursor. Pads every cell to the column's
 *  max display-width and respects the separator row's alignment markers. */
export function formatTableAtCursor(view: EditorView): boolean {
  const { state } = view;
  const cursorLine = state.doc.lineAt(state.selection.main.from);
  const range = findTableRange(state, cursorLine.number);
  if (!range) return false;

  const rows: ParsedRow[] = [];
  const lines: Line[] = [];
  for (let n = range.fromLine; n <= range.toLine; n++) {
    const ln = state.doc.line(n);
    const parsed = parseRow(ln.text);
    if (!parsed) return false;
    rows.push(parsed);
    lines.push(ln);
  }

  const cols = Math.max(...rows.map((r) => r.cells.length));
  const widths = new Array<number>(cols).fill(0);
  for (const r of rows) {
    if (r.isSeparator) continue;
    for (let c = 0; c < r.cells.length; c++) {
      widths[c] = Math.max(widths[c], displayWidth(r.cells[c]));
    }
  }
  // Separator row needs at least 3 hyphens between markers.
  for (let c = 0; c < cols; c++) widths[c] = Math.max(widths[c], 3);

  const sep = rows.find((r) => r.isSeparator);
  const alignments: ("l" | "c" | "r")[] =
    sep?.alignments ?? new Array(cols).fill("l");
  // Pad alignments / widths to cols.
  while (alignments.length < cols) alignments.push("l");

  const formatted: string[] = rows.map((r) => {
    if (r.isSeparator) {
      const cells = new Array(cols).fill(0).map((_, i) => {
        const dashes = "-".repeat(widths[i]);
        const a = alignments[i];
        if (a === "c") return ":" + dashes.slice(0, -2) + "-:";
        if (a === "r") return dashes.slice(0, -1) + ":";
        return dashes;
      });
      return "| " + cells.join(" | ") + " |";
    }
    const cells = new Array(cols).fill(0).map((_, i) => {
      const v = r.cells[i] ?? "";
      return pad(v, widths[i], alignments[i]);
    });
    return "| " + cells.join(" | ") + " |";
  });

  const start = lines[0].from;
  const end = lines[lines.length - 1].to;
  view.dispatch({
    changes: { from: start, to: end, insert: formatted.join("\n") },
  });
  return true;
}

/** Move the caret to the next cell. If at the last cell of the last row, append
 *  a new (empty) row. Falls through (returns false) if cursor isn't in a
 *  table — the default Tab handler then runs. */
export function tableNextCell(view: EditorView): boolean {
  const { state } = view;
  const { from, to } = state.selection.main;
  if (from !== to) return false;
  const line = state.doc.lineAt(from);
  if (!isTableLine(line.text)) return false;

  const offsetInLine = from - line.from;
  const text = line.text;
  // Next pipe strictly after cursor.
  let next = -1;
  for (let i = offsetInLine; i < text.length; i++) {
    if (text[i] === "|") {
      // Skip the pipe the cursor is sitting on so Tab actually moves.
      if (i === offsetInLine) continue;
      next = i;
      break;
    }
  }

  if (next >= 0) {
    // Land just past `| ` so the caret sits in the next cell's content area.
    const after = next + (text[next + 1] === " " ? 2 : 1);
    view.dispatch({
      selection: { anchor: line.from + Math.min(after, text.length) },
    });
    return true;
  }

  // No more cells on this row. Move to first cell of next table row, or
  // append a fresh empty row if we're already at the bottom.
  const isLast = line.number >= state.doc.lines;
  const nextLine = isLast ? null : state.doc.line(line.number + 1);
  if (!isLast && nextLine && isTableLine(nextLine.text)) {
    const firstPipe = nextLine.text.indexOf("|");
    if (firstPipe >= 0) {
      const after = firstPipe + (nextLine.text[firstPipe + 1] === " " ? 2 : 1);
      view.dispatch({
        selection: { anchor: nextLine.from + Math.min(after, nextLine.text.length) },
      });
      return true;
    }
  }
  // Bottom of table → insert empty row with the same column count.
  const cellCount = Math.max(1, (text.match(/\|/g)?.length ?? 0) - 1);
  const insert = "\n|" + "  |".repeat(cellCount);
  const insertAt = line.to;
  view.dispatch({
    changes: { from: insertAt, to: insertAt, insert },
    // Cursor lands inside first cell of the new row (after `| `).
    selection: { anchor: insertAt + 3 },
  });
  return true;
}

export function tablePrevCell(view: EditorView): boolean {
  const { state } = view;
  const { from, to } = state.selection.main;
  if (from !== to) return false;
  const line = state.doc.lineAt(from);
  if (!isTableLine(line.text)) return false;

  const offsetInLine = from - line.from;
  const text = line.text;
  // Previous pipe strictly before cursor (skip the pipe just before content
  // so Shift+Tab moves a full cell, not back onto the boundary).
  let prev = -1;
  for (let i = offsetInLine - 1; i >= 0; i--) {
    if (text[i] === "|") {
      // The pipe immediately before cursor delimits the *current* cell;
      // we want the one before that.
      if (prev === -1) {
        prev = i;
        continue;
      }
      // Land just past this earlier pipe.
      const after = i + (text[i + 1] === " " ? 2 : 1);
      view.dispatch({
        selection: { anchor: line.from + after },
      });
      return true;
    }
  }
  // No previous cell on this row → previous table row's last cell.
  if (line.number > 1) {
    const target = state.doc.line(line.number - 1);
    if (isTableLine(target.text)) {
      const lastPipe = target.text.lastIndexOf("|");
      const beforeLast = lastPipe > 0
        ? target.text.lastIndexOf("|", lastPipe - 1)
        : -1;
      if (beforeLast >= 0) {
        const after = beforeLast + (target.text[beforeLast + 1] === " " ? 2 : 1);
        view.dispatch({
          selection: { anchor: target.from + after },
        });
        return true;
      }
    }
  }
  return false;
}

export const markdownTableKeymap: readonly KeyBinding[] = [
  { key: "Tab", run: tableNextCell },
  { key: "Shift-Tab", run: tablePrevCell },
];
