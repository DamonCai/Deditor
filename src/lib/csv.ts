export type CsvDelimiter = "," | ";" | "\t";
export type CsvIssue = "unclosedQuote" | "unexpectedQuote";

/** Display-only parsing: never normalizes or writes back the source document.
 * Incomplete quoted fields remain visible while the user is typing. */
export function parseCsv(source: string, delimiter: CsvDelimiter = ",") {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false, closed = false;
  let issue: CsvIssue | null = null;
  const start = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  const finishField = () => { row.push(field); field = ""; closed = false; };
  const finishRow = () => { finishField(); rows.push(row); row = []; };
  for (let i = start; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += char;
    } else if (char === delimiter) finishField();
    else if (char === "\r" || char === "\n") {
      finishRow();
      if (char === "\r" && source[i + 1] === "\n") i++;
    } else if (char === '"' && field === "" && !closed) quoted = true;
    else {
      if (char === '"' || closed) issue ??= "unexpectedQuote";
      field += char;
    }
  }
  if (quoted) issue ??= "unclosedQuote";
  // A final record terminator is not an extra row. Empty fields and blank
  // records elsewhere are preserved, including a trailing delimiter.
  if (source.length > start && (row.length || field !== "" || closed || quoted || !/[\r\n]$/.test(source))) finishRow();
  let columns = 0;
  for (const cells of rows) columns = Math.max(columns, cells.length);
  return { rows, columns, issue, ragged: rows.some(cells => cells.length !== columns) };
}
