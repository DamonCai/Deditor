import { Fragment, Slice, type Node as ProseNode } from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";
import { CellSelection, isInTable, selectedRect } from "@milkdown/kit/prose/tables";
import { emojiValue } from "../markdownShorthand";
import { EditorView as CodeView } from "@codemirror/view";
import { isWindowCloseCommitted } from "../windowCloseGuard";
import { showError } from "../feedback";
import { tStatic } from "../i18n";

export interface MarkdownClipboardPayload { markdown: string; text: string; html: string; tsv?: string }

/** Ordinary copy exposes the selected text, never Markdown serialization escapes. */
export function clipboardText(slice: Slice): string {
  return slice.content.textBetween(0, slice.content.size, "\n", node => {
    switch (node.type.name) {
      case "hardbreak": return "\n";
      case "deditor_emoji": return emojiValue(node.attrs.name) ?? `:${node.attrs.name}:`;
      case "image": case "image-block": return node.attrs.alt ?? "";
      case "math_inline": return node.attrs.value ?? "";
      case "footnote_reference": return `[${node.attrs.label || node.attrs.identifier}]`;
      default: return node.type.spec.leafText?.(node) ?? "";
    }
  });
}

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
        texts.push(clipboardText(new Slice(cell.content, 0, 0)));
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
    text: clipboardText(slice),
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

export function installPlainClipboardShortcuts(view: EditorView, enabled: () => boolean) {
  let disposed = false, request = 0;
  const keydown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (!enabled() || isWindowCloseCommitted() || event.defaultPrevented || event.isComposing || view.composing ||
      event.altKey || !(event.metaKey || event.ctrlKey) || !event.shiftKey || !['c', 'v'].includes(key)) return;
    const target = event.target instanceof Element ? event.target : null;
    const codeRoot = target?.closest<HTMLElement>('.cm-editor');
    const code = codeRoot ? CodeView.findFromDOM(codeRoot) : null;
    if (target?.closest('input,textarea,select') && !code) return;
    // Handle the command itself: native plain-paste can arrive after keyup or
    // without the keydown/paste ordering assumed by a pending-event flag.
    event.preventDefault(); event.stopImmediatePropagation();
    const state = view.state, codeState = code?.state, token = ++request;
    const run = async () => {
      if (key === 'c') {
        if (codeState ? codeState.selection.main.empty : state.selection.empty) return;
        const text = codeState ? codeState.sliceDoc(codeState.selection.main.from, codeState.selection.main.to) : clipboardText(state.selection.content());
        await navigator.clipboard.writeText(text);
        return;
      }
      if (!view.editable || codeState?.readOnly || code?.composing) return;
      const text = await navigator.clipboard.readText();
      if (!text || disposed || token !== request || !enabled() || isWindowCloseCommitted() || !view.editable || view.composing ||
        view.state.doc !== state.doc || !view.state.selection.eq(state.selection)) return;
      if (code && codeState) {
        if (!code.hasFocus || code.composing || code.state.readOnly || code.state.doc !== codeState.doc || !code.state.selection.eq(codeState.selection)) return;
        const inserted = code.state.toText(text);
        code.dispatch({ changes: { from: codeState.selection.main.from, to: codeState.selection.main.to, insert: inserted },
          selection: { anchor: codeState.selection.main.from + inserted.length }, userEvent: 'input.paste' });
      } else if (view.hasFocus()) insertPlainText(view, text);
    };
    void run().catch(() => {
      if (!disposed && enabled() && !isWindowCloseCommitted()) void showError(tStatic('md.clipboardError'));
    });
  };
  view.dom.addEventListener('keydown', keydown, true);
  return () => { disposed = true; view.dom.removeEventListener('keydown', keydown, true); };
}
