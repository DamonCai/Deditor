import type { EditorView } from "@milkdown/kit/prose/view";
import { EditorState, NodeSelection, Selection, TextSelection } from "@milkdown/kit/prose/state";
import { addRowAfter, goToNextCell, isInTable } from "@milkdown/kit/prose/tables";

/** Preserve table caret positions through clearing, boundary navigation and history. */
export function handleTableKeys(view: EditorView, event: KeyboardEvent) {
  if (!view.editable) return false;
  const selection = view.state.selection;
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
  event.preventDefault();
  if (goToNextCell(event.shiftKey ? -1 : 1)(view.state, view.dispatch)) return true;
  if (!event.shiftKey) {
    addRowAfter(view.state, tr => {
      // Only calculate the cell move here; plugin append-transactions must run
      // once, when the combined transaction is dispatched to the real view.
      const next = EditorState.create({ doc: tr.doc, selection: tr.selection });
      goToNextCell(1)(next, move => tr.setSelection(move.selection));
      view.dispatch(tr);
    });
  }
  return true;
}
