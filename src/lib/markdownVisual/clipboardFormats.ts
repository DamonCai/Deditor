import { Fragment, Slice, type Node as ProseNode } from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";
import { CellSelection, isInTable, selectedRect } from "@milkdown/kit/prose/tables";

export interface MarkdownClipboardPayload { markdown: string; text: string; html: string; tsv?: string }

export function clipboardPayload(view: EditorView, source: string, serialize: (doc: ProseNode) => string): MarkdownClipboardPayload {
  const { doc, selection, schema } = view.state;
  let slice = selection.empty ? new Slice(doc.content, 0, 0) : selection.content();
  let tsv: string | undefined;
  if (isInTable(view.state)) {
    const rect = selectedRect(view.state), cells = selection instanceof CellSelection;
    const top = cells ? rect.top : 0, bottom = cells ? rect.bottom : rect.map.height;
    const left = cells ? rect.left : 0, right = cells ? rect.right : rect.map.width;
    const rows: ProseNode[] = [], values: string[][] = [];
    for (let r = top; r < bottom; r++) {
      const row: ProseNode[] = [], texts: string[] = [];
      for (let c = left; c < right; c++) {
        const cell = rect.table.nodeAt(rect.map.map[r * rect.map.width + c])!;
        texts.push(cell.textBetween(0, cell.content.size, "\n", "\n"));
        row.push((r === top ? schema.nodes.table_header : schema.nodes.table_cell).create(cell.attrs, cell.content));
      }
      values.push(texts);
      rows.push((r === top ? schema.nodes.table_header_row : schema.nodes.table_row).create(null, row));
    }
    tsv = values.map(row => row.map(value => /[\t\r\n"]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value).join("\t")).join("\n");
    if (cells) slice = new Slice(Fragment.from(schema.nodes.table.create(null, rows)), 0, 0);
  }
  const { dom } = view.serializeForClipboard(slice);
  // Inline borders make copied tables readable in document/email editors.
  dom.querySelectorAll('table').forEach(table => { table.style.borderCollapse = 'collapse'; });
  const alignments: Array<string | null> = [];
  slice.content.descendants(node => {
    if (node.type.name === 'table_cell' || node.type.name === 'table_header') alignments.push(node.attrs.alignment);
  });
  dom.querySelectorAll<HTMLElement>('td,th').forEach((cell, i) => {
    cell.style.border = '1px solid #d1d5db'; cell.style.padding = '4px 8px';
    // The display serializer supplies left alignment for an unspecified cell.
    // Copy its authored value so a round trip does not add ':' to every column.
    cell.style.textAlign = alignments[i] ?? '';
    if (alignments[i] == null) cell.setAttribute('data-deditor-alignment', 'default');
  });
  const copiedDoc = schema.topNodeType.createAndFill(null, slice.content);
  return {
    markdown: selection.empty ? source : copiedDoc ? serialize(copiedDoc) : view.serializeForClipboard(slice).text,
    text: slice.content.textBetween(0, slice.content.size, "\n", "\n"),
    html: dom.innerHTML,
    tsv,
  };
}

/** Literal text bypasses Markdown, HTML and TSV parsing. */
export function insertPlainText(view: EditorView, text: string) {
  if (!view.editable || view.composing || !text) return false;
  const { schema, selection } = view.state;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let tr = view.state.tr;
  if (selection.$from.parent.type.spec.code) tr = tr.insertText(lines.join("\n"));
  else if (isInTable(view.state)) {
    const nodes = lines.flatMap((line, i) => [...(i ? [schema.nodes.hardbreak.create()] : []), ...(line ? [schema.text(line)] : [])]);
    tr = tr.replaceSelection(new Slice(Fragment.from(nodes), 0, 0));
  } else if (lines.length === 1) tr = tr.replaceSelection(new Slice(Fragment.from(schema.text(text)), 0, 0));
  else {
    const paragraphs = lines.map(line => schema.nodes.paragraph.create(null, line ? schema.text(line) : null));
    tr = tr.replaceSelection(new Slice(Fragment.from(paragraphs), 1, 1));
  }
  view.dispatch(tr.setMeta('deditor-list-operation', true).setMeta('paste', true).setMeta('uiEvent', 'paste').scrollIntoView());
  view.focus(); return true;
}

export function installPlainPasteShortcut(view: EditorView, enabled: () => boolean) {
  let pending = false;
  const keydown = (event: KeyboardEvent) => { pending = enabled() && !(event.target instanceof Element && event.target.closest('.cm-editor')) && (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'v'; };
  const keyup = () => { pending = false; };
  const paste = (event: ClipboardEvent) => {
    if (!pending || !enabled() || !view.editable || view.composing || !event.clipboardData) return;
    pending = false; event.preventDefault(); event.stopImmediatePropagation();
    insertPlainText(view, event.clipboardData.getData('text/plain'));
  };
  view.dom.addEventListener('keydown', keydown, true); view.dom.addEventListener('keyup', keyup);
  view.dom.addEventListener('paste', paste, true); view.dom.addEventListener('blur', keyup);
  return () => { view.dom.removeEventListener('keydown', keydown, true); view.dom.removeEventListener('keyup', keyup); view.dom.removeEventListener('paste', paste, true); view.dom.removeEventListener('blur', keyup); };
}
