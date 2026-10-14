import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

/** Leave a nested source editor without placing a text caret inside another atomic block. */
export function exitBlockSource(view: EditorView, node: ProseNode, pos: number | undefined, direction: -1 | 1) {
  if (!view.editable || pos === undefined) return false;
  const boundary = direction < 0 ? pos : pos + node.nodeSize;
  const $boundary = view.state.doc.resolve(boundary);
  const neighbor = direction < 0 ? $boundary.nodeBefore : $boundary.nodeAfter;
  const tr = view.state.tr;
  let caret: number;
  if (neighbor?.isTextblock && !neighbor.type.spec.code) {
    caret = boundary + direction;
  } else {
    const paragraph = view.state.schema.nodes.paragraph;
    if (!$boundary.parent.canReplaceWith($boundary.index(), $boundary.index(), paragraph)) return false;
    tr.insert(boundary, paragraph.create());
    caret = boundary + 1;
  }
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, caret)).scrollIntoView());
  view.focus();
  return true;
}
