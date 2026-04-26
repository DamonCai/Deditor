import { diffLines, type Change } from "diff";

export type ChangeType = "eq" | "del" | "add" | "mod";

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
 *  so a "modified line" shows up on the same row on both sides. */
export function computeDiff(left: string, right: string): DiffResult {
  const parts: Change[] = diffLines(left, right);
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
        // Pair removed+added: same row, both sides shown.
        const nextLines = splitChunk(next.value);
        const max = Math.max(lines.length, nextLines.length);
        for (let j = 0; j < max; j++) {
          const l = lines[j];
          const r = nextLines[j];
          rows.push({
            left: l ?? null,
            right: r ?? null,
            leftLineNum: l != null ? leftLine++ : null,
            rightLineNum: r != null ? rightLine++ : null,
            changeType: "mod",
          });
          modified++;
        }
        i++; // consumed the paired added chunk
      } else {
        for (const line of lines) {
          rows.push({
            left: line,
            right: null,
            leftLineNum: leftLine++,
            rightLineNum: null,
            changeType: "del",
          });
          removed++;
        }
      }
    } else if (p.added) {
      for (const line of lines) {
        rows.push({
          left: null,
          right: line,
          leftLineNum: null,
          rightLineNum: rightLine++,
          changeType: "add",
        });
        added++;
      }
    } else {
      for (const line of lines) {
        rows.push({
          left: line,
          right: line,
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
