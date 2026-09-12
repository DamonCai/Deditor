import { $shortcut } from "@milkdown/kit/utils";
import { TextSelection, type Command } from "@milkdown/kit/prose/state";
import { sinkListItem, liftListItem } from "@milkdown/kit/prose/schema-list";
import { isInTable } from "@milkdown/kit/prose/tables";
import { taskIndent } from "../markdownListIndent";
import { Fragment, type NodeType } from "@milkdown/kit/prose/model";

const liftWithIndent = (item: NodeType): Command => (state, dispatch, view) => {
  const range = state.selection.$from.blockRange(state.selection.$to, node => node.childCount > 0 && node.firstChild!.type === item);
  const parent = range && range.depth > 0 ? range.$from.node(range.depth - 1) : null;
  const inherited = parent?.type === item ? taskIndent(parent.attrs.taskIndent) : 0;
  return liftListItem(item)(state, dispatch && (tr => {
    if (range && inherited) {
      let pos = range.start;
      for (let i = range.startIndex; i < range.endIndex; i++) {
        const before = range.parent.child(i);
        const mapped = tr.doc.resolve(tr.mapping.map(pos + 2));
        if (mapped.depth > 1 && mapped.node(-1).type === item && typeof mapped.node(-1).attrs.checked === "boolean") {
          const node = mapped.node(-1);
          tr.setNodeMarkup(mapped.before(-1), undefined, { ...node.attrs, taskIndent: taskIndent(taskIndent(node.attrs.taskIndent) + inherited) });
        }
        pos += before.nodeSize;
      }
    }
    dispatch(tr);
  }), view);
};

const joinTaskForward: Command = (state, dispatch, view) => {
  const { selection } = state;
  if (view?.editable === false || view?.composing || !(selection instanceof TextSelection) || !selection.empty) return false;
  const { $from } = selection;
  if ($from.depth < 2 || $from.parent.type.name !== "paragraph" || $from.parentOffset !== $from.parent.content.size) return false;
  const item = $from.node(-1);
  if (item.type.name !== "list_item" || typeof item.attrs.checked !== "boolean" || item.childCount !== 1) return false;
  const start = $from.before(-1), next = state.doc.nodeAt(start + item.nodeSize);
  if (next?.type !== item.type || typeof next.attrs.checked !== "boolean" || taskIndent(next.attrs.taskIndent) !== taskIndent(item.attrs.taskIndent)) return false;
  if (dispatch) {
    const paragraph = item.firstChild!.copy(item.firstChild!.content.append(next.firstChild!.content));
    const merged = item.copy(Fragment.from(paragraph).append(next.content.cut(next.firstChild!.nodeSize)));
    const tr = state.tr.replaceWith(start, start + item.nodeSize + next.nodeSize, merged);
    dispatch(tr.setSelection(TextSelection.create(tr.doc, selection.from)).setMeta("deditor-list-operation", true).scrollIntoView());
  }
  return true;
};

/** A rendered <br> in an otherwise empty task is a placeholder, not task text. */
const leaveTask: Command = (state, dispatch, view) => {
  const { selection } = state;
  if (view?.editable === false || view?.composing || !(selection instanceof TextSelection) || !selection.empty) return false;
  const { $from } = selection;
  if ($from.depth < 2 || $from.parent.type.name !== "paragraph") return false;
  const item = $from.node(-1);
  if (item.type.name !== "list_item" || typeof item.attrs.checked !== "boolean" || $from.index(-1) !== 0) return false;
  let empty = true;
  $from.parent.forEach(child => { if (child.type.name !== "hardbreak") empty = false; });
  if (!empty && $from.parentOffset !== 0) return false;
  if (taskIndent(item.attrs.taskIndent)) {
    dispatch?.(state.tr.setNodeMarkup($from.before(-1), undefined, { ...item.attrs, taskIndent: taskIndent(item.attrs.taskIndent) - 1 }).setMeta("deditor-list-operation", true).scrollIntoView());
    return true;
  }
  return liftWithIndent(item.type)(state, dispatch && (tr => {
    if (empty) {
      const caret = tr.selection.$from;
      if (caret.parent.type.name === "paragraph") tr.delete(caret.start(), caret.end());
    }
    dispatch(tr.setMeta("deditor-list-operation", true).scrollIntoView());
  }), view);
};

/** List indentation must not fall through to insertion of literal tab spaces. */
const indentList = (reverse: boolean): Command => (state, dispatch, view) => {
  if (view?.editable === false || view?.composing || !(state.selection instanceof TextSelection) || isInTable(state)) return false;
  const { $from } = state.selection;
  if ($from.parent.type.spec.code) return false;
  let item = null;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === "list_item") {
      item = $from.node(depth).type;
      break;
    }
  }
  if (!item) return false;
  const range = $from.blockRange(state.selection.$to, node => node.childCount > 0 && node.firstChild!.type === item);
  if (range) {
    const selected = Array.from({ length: range.endIndex - range.startIndex }, (_, index) => range.parent.child(range.startIndex + index));
    const hasIndent = selected.some(node => taskIndent(node.attrs.taskIndent) > 0);
    const indentedPredecessor = range.startIndex > 0 && taskIndent(range.parent.child(range.startIndex - 1).attrs.taskIndent) > 0;
    if (selected.every(node => typeof node.attrs.checked === "boolean") && (hasIndent || !reverse && (range.startIndex === 0 || indentedPredecessor))) {
      const tr = state.tr; let pos = range.start;
      for (const node of selected) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, taskIndent: taskIndent(taskIndent(node.attrs.taskIndent) + (reverse ? -1 : 1)) });
        pos += node.nodeSize;
      }
      dispatch?.(tr.setMeta("deditor-list-operation", true).scrollIntoView()); return true;
    }
  }
  (reverse ? liftWithIndent(item) : sinkListItem(item))(state, dispatch && (tr => dispatch(tr.setMeta("deditor-list-operation", true))), view);
  return true;
};
export const markdownListKeys = $shortcut(() => ({
  Delete: { key: "Delete", priority: 120, onRun: () => joinTaskForward },
  Backspace: { key: "Backspace", priority: 120, onRun: () => leaveTask },
  Enter: { key: "Enter", priority: 120, onRun: () => (state, dispatch, view) => {
    if (state.selection.$from.parent.textContent.replace(/\n/g, "") || state.selection.$from.parent.childCount > 1) return false;
    return leaveTask(state, dispatch, view);
  } },
  Tab: { key: "Tab", priority: 110, onRun: () => indentList(false) },
  "Shift-Tab": { key: "Shift-Tab", priority: 110, onRun: () => indentList(true) },
}));
