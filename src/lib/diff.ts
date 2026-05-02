import { diffLines, diffWordsWithSpace, type Change } from "diff";

export type ChangeType = "eq" | "del" | "add" | "mod";

/** How to normalize whitespace before line diffing — mirrors JetBrains'
 *  "Do not ignore / Trim trailing / Ignore whitespaces" dropdown plus
 *  "Ignore all whitespaces". */
export type WhitespaceMode = "none" | "leading" | "all";

function normalize(text: string, mode: WhitespaceMode): string {
  if (mode === "none") return text;
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (mode === "leading") {
        // Trim trailing spaces; preserve indentation.
        return line.replace(/\s+$/g, "");
      }
      // "all" — collapse runs of whitespace to single space, drop leading/
      // trailing. Matches `git diff -w` semantics.
      return line.replace(/\s+/g, " ").trim();
    })
    .join("\n");
}

export interface DiffRow {
  left: string | null;
  right: string | null;
  leftLineNum: number | null;
  rightLineNum: number | null;
  changeType: ChangeType;
}

export interface DiffStats {
  addedLines: number;
  removedLines: number;
  modifiedLines: number;
}

export interface DiffResult {
  rows: DiffRow[];
  stats: DiffStats;
}

/** Run a line-level diff and convert jsdiff's hunk output into row-aligned form
 *  suitable for a side-by-side view. Adjacent removed+added chunks are paired
 *  so a "modified line" shows up on the same row on both sides.
 *
 *  Whitespace handling: when `whitespace !== "none"` we normalize BOTH sides
 *  before diffing but write the ORIGINAL lines to the rows (otherwise the
 *  preview would show stripped strings). */
export function computeDiff(
  left: string,
  right: string,
  whitespace: WhitespaceMode = "none",
): DiffResult {
  // For whitespace-insensitive diffing, run jsdiff on normalized text but
  // index back into the original via line count. Both sides have the same
  // line count after splitting (jsdiff reads strings, line breaks survive).
  const parts: Change[] =
    whitespace === "none"
      ? diffLines(left, right)
      : diffLines(normalize(left, whitespace), normalize(right, whitespace));
  const origLeftLines = left.split(/\r?\n/);
  const origRightLines = right.split(/\r?\n/);
  const rows: DiffRow[] = [];
  let leftLine = 1;
  let rightLine = 1;
  let added = 0;
  let removed = 0;
  let modified = 0;

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const lines = splitChunk(p.value);

    if (p.removed) {
      const next = parts[i + 1];
      if (next?.added) {
        const nextLines = splitChunk(next.value);
        const max = Math.max(lines.length, nextLines.length);
        for (let j = 0; j < max; j++) {
          // When whitespace is normalized, swap in the original line content
          // so the visual diff still shows the user's actual text.
          const lOrig =
            j < lines.length ? origLeftLines[leftLine - 1] : undefined;
          const rOrig =
            j < nextLines.length ? origRightLines[rightLine - 1] : undefined;
          rows.push({
            left: lOrig ?? null,
            right: rOrig ?? null,
            leftLineNum: j < lines.length ? leftLine++ : null,
            rightLineNum: j < nextLines.length ? rightLine++ : null,
            changeType: "mod",
          });
          modified++;
        }
        i++;
      } else {
        for (let j = 0; j < lines.length; j++) {
          rows.push({
            left: origLeftLines[leftLine - 1] ?? lines[j],
            right: null,
            leftLineNum: leftLine++,
            rightLineNum: null,
            changeType: "del",
          });
          removed++;
        }
      }
    } else if (p.added) {
      for (let j = 0; j < lines.length; j++) {
        rows.push({
          left: null,
          right: origRightLines[rightLine - 1] ?? lines[j],
          leftLineNum: null,
          rightLineNum: rightLine++,
          changeType: "add",
        });
        added++;
      }
    } else {
      for (let j = 0; j < lines.length; j++) {
        const text = origLeftLines[leftLine - 1] ?? lines[j];
        rows.push({
          left: text,
          right: text,
          leftLineNum: leftLine++,
          rightLineNum: rightLine++,
          changeType: "eq",
        });
      }
    }
  }

  return { rows, stats: { addedLines: added, removedLines: removed, modifiedLines: modified } };
}

/** jsdiff's `value` keeps the trailing newline of each chunk. Splitting on
 *  /\r?\n/ then dropping the final empty string gives us the actual lines
 *  that belong to this chunk. */
function splitChunk(value: string): string[] {
  const lines = value.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Word-level diff for a `mod` row pair. Returns runs that the renderer
 *  can colorize: each segment carries its text + which side(s) it appears
 *  on. Used for "Highlight words" toggle in the diff toolbar. */
export interface WordSeg {
  text: string;
  /** "eq" — same on both sides; "del" — only left; "add" — only right. */
  kind: "eq" | "del" | "add";
}

export function diffWords(
  left: string,
  right: string,
): { left: WordSeg[]; right: WordSeg[] } {
  const parts = diffWordsWithSpace(left, right);
  const lefts: WordSeg[] = [];
  const rights: WordSeg[] = [];
  for (const p of parts) {
    if (p.removed) {
      lefts.push({ text: p.value, kind: "del" });
    } else if (p.added) {
      rights.push({ text: p.value, kind: "add" });
    } else {
      lefts.push({ text: p.value, kind: "eq" });
      rights.push({ text: p.value, kind: "eq" });
    }
  }
  return { left: lefts, right: rights };
}
