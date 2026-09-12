import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { exitBlockSource } from "./blockExit";

/** Blank space below the article is an editing target, even after a node view. */
export function installDocumentEnd(view: EditorView, scroller: HTMLElement) {
  const mousedown = (event: MouseEvent) => {
    if (!view.editable || view.composing || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    // Ignore controls and all content inside a block (including nested editors).
    if (!(target instanceof HTMLElement) || !target.contains(view.dom)) return;
    const last = view.state.doc.lastChild;
    if (!last) return;
    const pos = view.state.doc.content.size - last.nodeSize;
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement) || event.clientY <= dom.getBoundingClientRect().bottom) return;
    const rect = view.dom.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right) return;
    event.preventDefault();
    if (event.shiftKey) {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, view.state.selection.anchor,
        TextSelection.atEnd(view.state.doc).head)).scrollIntoView());
      view.focus();
    } else if (last.isTextblock && !last.type.spec.code) {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + last.nodeSize - 1)).scrollIntoView());
      view.focus();
    } else exitBlockSource(view, last, pos, 1);
  };
  scroller.addEventListener("mousedown", mousedown);
  return () => scroller.removeEventListener("mousedown", mousedown);
}

export function handleSelectedBlockExit(view: EditorView, event: KeyboardEvent) {
  if (event.isComposing || view.composing || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
  const selection = view.state.selection;
  if (!(selection instanceof NodeSelection) || !["code_block", "deditor_raw"].includes(selection.node.type.name)) return false;
  if (event.key !== "Enter" && event.key !== "ArrowDown" && event.key !== "ArrowUp") return false;
  return exitBlockSource(view, selection.node, selection.from, event.key === "ArrowUp" ? -1 : 1);
}
