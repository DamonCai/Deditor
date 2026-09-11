import { Fragment, Slice } from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";
import { handlePaste, isInTable, selectedRect, tableNodeTypes } from "@milkdown/kit/prose/tables";

/** Spreadsheet TSV, including quoted tabs/newlines and escaped quotes. */
export function parseTableClipboard(text: string): string[][] {
  const rows: string[][] = [[]]; let value = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && (quoted || value === "")) {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (char === "\t" || char === "\n" || char === "\r")) {
      rows.at(-1)!.push(value); value = "";
      if (char !== "\t") { if (char === "\r" && text[i + 1] === "\n") i++; rows.push([]); }
    } else value += char;
  }
  rows.at(-1)!.push(value);
  if (rows.length > 1 && rows.at(-1)!.length === 1 && rows.at(-1)![0] === "" && /[\r\n]$/.test(text)) rows.pop();
  return rows;
}
export function pasteTableClipboard(view: EditorView, event: ClipboardEvent) {
  if (!view.editable || !isInTable(view.state)) return false;
  const text = event.clipboardData?.getData("text/plain");
  // Let the mature table plugin retain rich formatting for HTML tables.
  if (!text?.includes("\t") || /<table[\s>]/i.test(event.clipboardData?.getData("text/html") ?? "")) return false;
  const rows = parseTableClipboard(text), width = Math.max(...rows.map(row => row.length));
  if (rows.length * width > 10000) return false; // Preserve oversized input through the normal text paste path.
  const { schema } = view.state, types = tableNodeTypes(schema), target = selectedRect(view.state);
  const nodes = rows.map((row, r) => types.row.create(null, Array.from({ length: width }, (_, c) => {
    const cell = target.table.nodeAt(target.map.map[Math.min(target.map.width - 1, target.left + c)]);
    const content = (row[c] ?? "").split(/\r?\n/).flatMap((line, i) => [ ...(i ? [schema.nodes.hardbreak.create()] : []), ...(line ? [schema.text(line)] : []) ]);
    return (target.top + r === 0 ? types.header_cell : types.cell).create({ alignment: cell?.attrs.alignment ?? null }, schema.nodes.paragraph.create(null, content));
  })));
  return handlePaste(view, event, new Slice(Fragment.from(types.table.create(null, nodes)), 0, 0));
}
