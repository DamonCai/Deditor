import { $shortcut } from "@milkdown/kit/utils";
import { TextSelection, type Command } from "@milkdown/kit/prose/state";
import { sinkListItem, liftListItem } from "@milkdown/kit/prose/schema-list";
import { isInTable } from "@milkdown/kit/prose/tables";

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
  (reverse ? liftListItem(item) : sinkListItem(item))(state, dispatch);
  return true;
};
export const markdownListKeys = $shortcut(() => ({
  Tab: { key: "Tab", priority: 110, onRun: () => indentList(false) },
  "Shift-Tab": { key: "Shift-Tab", priority: 110, onRun: () => indentList(true) },
}));
