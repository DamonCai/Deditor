import { Fragment, Slice } from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";
import { handlePaste, isInTable, selectedRect, tableNodeTypes } from "@milkdown/kit/prose/tables";
import { Plugin } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";

/** GFM requires a header, whereas spreadsheet HTML commonly uses only td.
 * Promote the actual first row before schema fitting can invent an empty one.
 * Do not remove empty rows: they may be authored spreadsheet content. */
export function normalizeClipboardTableHeaders(html: string): string {
  if (!/<table[\s>]/i.test(html)) return html;
  const document = new DOMParser().parseFromString(html, "text/html");
  let changed = false;
  for (const table of document.querySelectorAll("table")) {
    const rows = Array.from(table.rows);
    if (!rows.length || rows.some(row => Array.from(row.cells).some(cell => cell.tagName === "TH"))) continue;
    for (const cell of Array.from(rows[0].cells)) {
      const header = document.createElement("th");
      for (const attribute of Array.from(cell.attributes)) header.setAttribute(attribute.name, attribute.value);
      while (cell.firstChild) header.append(cell.firstChild);
      cell.replaceWith(header);
      changed = true;
    }
  }
  return changed ? document.body.innerHTML : html;
}

export const spreadsheetTableHeaders = $prose(() => new Plugin({
  props: { transformPastedHTML: normalizeClipboardTableHeaders },
}));

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
export function pasteTableClipboard(view: EditorView, event: ClipboardEvent, slice?: Slice) {
  if (!view.editable || !isInTable(view.state)) return false;
  const text = event.clipboardData?.getData("text/plain");
  // Run the table handler before Milkdown's generic rich paste replaces the
  // surrounding table structure. The parsed slice retains cell marks/attrs.
  if (/<table[\s>]/i.test(event.clipboardData?.getData("text/html") ?? "")) {
    if (!slice) return false;
    let content = slice.content;
    if (content.childCount === 1 && content.firstChild?.type.spec.tableRole === "table") content = content.firstChild.content;
    const rows = Array.from({ length: content.childCount }, (_, index) => content.child(index));
    if (!rows.length || rows.some(row => row.type.spec.tableRole !== "row")) return false;
    const types = tableNodeTypes(view.state.schema), target = selectedRect(view.state);
    // GFM has distinct header/data row schemas. Inserting source header cells
    // into a body row would make ProseMirror's fitting remove surrounding rows.
    const fitted = rows.map((row, index) => types.row.create(row.attrs,
      Array.from({ length: row.childCount }, (_, column) => {
        const cell = row.child(column), type = target.top + index === 0 ? types.header_cell : types.cell;
        return type.create(cell.attrs, cell.content, cell.marks);
      })));
    return handlePaste(view, event, new Slice(Fragment.from(fitted), 0, 0));
  }
  if (!text?.includes("\t")) return false;
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
