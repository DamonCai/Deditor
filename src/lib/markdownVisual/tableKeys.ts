import type { EditorView } from "@milkdown/kit/prose/view";
import { EditorState, NodeSelection, Selection, TextSelection } from "@milkdown/kit/prose/state";
import { addRowAfter, CellSelection, goToNextCell, isInTable, selectedRect } from "@milkdown/kit/prose/tables";

/** Preserve table caret positions through clearing, boundary navigation and history. */
export function handleTableKeys(view: EditorView, event: KeyboardEvent) {
  if (!view.editable) return false;
  const selection = view.state.selection;
  if (event.key === "Tab" && !view.composing && !event.isComposing && event.keyCode !== 229
    && !event.metaKey && !event.ctrlKey && !event.altKey) {
    const wholeNode = selection instanceof NodeSelection && selection.node.type.name === "table";
    const wholeCells = selection instanceof CellSelection && selection.isRowSelection() && selection.isColSelection();
    if (wholeNode || wholeCells) {
      const rect = wholeCells ? selectedRect(view.state) : null;
      const node = wholeNode ? selection.node : rect!.table;
      const pos = wholeNode ? selection.from : rect!.tableStart - 1;
      const current = Number.isSafeInteger(node.attrs.indent) && node.attrs.indent > 0 ? node.attrs.indent : 0;
      const indent = Math.max(0, current + (event.shiftKey ? -1 : 1));
      event.preventDefault();
      if (indent !== current) {
        const tr = view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent });
        tr.setSelection(selection instanceof NodeSelection ? NodeSelection.create(tr.doc, pos)
          : CellSelection.create(tr.doc, selection.$anchorCell.pos, selection.$headCell.pos));
        view.dispatch(tr.setMeta("deditor-list-operation", true).scrollIntoView());
      }
      return true;
    }
    if (selection instanceof TextSelection && !selection.empty) {
      const { $from, $to } = selection;
      let cellDepth = $from.depth;
      while (cellDepth > 0 && !["table_cell", "table_header"].includes($from.node(cellDepth).type.name)) cellDepth--;
      if (!cellDepth || $from.sharedDepth($to.pos) < cellDepth) {
        let crossesTable = false;
        view.state.doc.nodesBetween(selection.from, selection.to, node => {
          if (node.type.name === "table") crossesTable = true;
          return !crossesTable;
        });
        if (crossesTable) {
          // A partial text range crossing table blocks is neither a cell nor
          // a whole-table selection. Do not let upstream Tab replace that
          // range with spaces or collapse it into its head cell.
          event.preventDefault();
          return true;
        }
      }
    }
  }
  const inTable = isInTable(view.state);
  if (!inTable && !view.composing && !event.isComposing && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey
    && selection instanceof TextSelection && selection.empty && selection.$from.parent.isTextblock && !selection.$from.parent.type.spec.code) {
    const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    const at = selection.$from;
    if (direction && at.parentOffset === (direction < 0 ? 0 : at.parent.content.size)) {
      const boundary = view.state.doc.resolve(direction < 0 ? at.before() : at.after());
      const neighbor = direction < 0 ? boundary.nodeBefore : boundary.nodeAfter;
      if (neighbor?.type.name === "table") {
        // The table view's non-editable wrapper can make native Left skip the
        // entire table. Enter its nearest text cell instead.
        const next = Selection.findFrom(boundary, direction, true);
        if (next) {
          event.preventDefault();
          view.dispatch(view.state.tr.setSelection(next).scrollIntoView());
          return true;
        }
      }
    }
  }
  if (!inTable) return false;
  if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey
    && !view.composing && !event.isComposing && event.keyCode !== 229) {
    // GFM binds plain Enter to ExitTable. Keep ordinary line breaks in the
    // cell; its serializer persists hardbreaks as <br>. Mod-Enter still exits.
    if (selection instanceof TextSelection) {
      let cellDepth = selection.$from.depth;
      while (cellDepth > 0 && !["table_cell", "table_header"].includes(selection.$from.node(cellDepth).type.name)) cellDepth--;
      if (cellDepth && selection.$from.sharedDepth(selection.to) >= cellDepth) {
        event.preventDefault();
        view.dispatch(view.state.tr.setMeta("hardbreak", true).replaceSelectionWith(view.state.schema.nodes.hardbreak.create()).scrollIntoView());
        return true;
      }
    } else if (selection instanceof CellSelection) {
      // Enter starts editing the selected cell without clearing a rectangle.
      const next = Selection.findFrom(selection.$headCell, 1, true);
      if (next) {
        event.preventDefault();
        view.dispatch(view.state.tr.setSelection(next).scrollIntoView());
        return true;
      }
    }
  }
  if ((event.key === "Backspace" || event.key === "Delete") && !event.metaKey && !event.ctrlKey && !event.altKey
    && !event.isComposing && !view.composing && selection instanceof NodeSelection
    && selection.node.type.name === "paragraph" && selection.$from.parent.childCount === 1
    && ["table_cell", "table_header"].includes(selection.$from.parent.type.name)) {
    // Clicking a cell's multiline paragraph can select that entire node.
    // Deleting its only paragraph otherwise fits a replacement but moves the
    // caret to the next cell. Clear it and retain this cell's insertion point.
    event.preventDefault();
    const tr = view.state.tr.replaceWith(selection.from, selection.to, view.state.schema.nodes.paragraph.create());
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, selection.from + 1)));
    return true;
  }
  if (event.key !== "Tab") return false;
  if (view.composing || event.isComposing || event.keyCode === 229 || event.metaKey || event.ctrlKey || event.altKey) return false;
  if (!(selection instanceof CellSelection)) {
    // isInTable uses the selection head only; navigate only within a cell.
    const { $from, $to } = selection;
    let cellDepth = $from.depth;
    while (cellDepth > 0 && !["table_cell", "table_header"].includes($from.node(cellDepth).type.name)) cellDepth--;
    if (!cellDepth || $from.sharedDepth($to.pos) < cellDepth) return false;
  }
  event.preventDefault();
  if (goToNextCell(event.shiftKey ? -1 : 1)(view.state, view.dispatch)) return true;
  if (!event.shiftKey) {
    addRowAfter(view.state, tr => {
      // Only calculate the cell move here; plugin append-transactions must run
      // once, when the combined transaction is dispatched to the real view.
      const next = EditorState.create({ doc: tr.doc, selection: tr.selection });
      goToNextCell(1)(next, move => tr.setSelection(move.selection));
      view.dispatch(tr.setMeta("deditor-list-operation", true));
    });
  }
  return true;
}
