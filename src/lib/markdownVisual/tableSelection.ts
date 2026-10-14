import { $prose } from '@milkdown/kit/utils';
import { Plugin, TextSelection } from '@milkdown/kit/prose/state';
import { tableEditing, fixTables } from '@milkdown/kit/prose/tables';
import type { ResolvedPos } from '@milkdown/kit/prose/model';

function tableAt(pos: ResolvedPos) {
  for (let depth = pos.depth; depth > 0; depth--) if (pos.node(depth).type.spec.tableRole === 'table') return pos.before(depth);
  return null;
}

/** Keep text ranges crossing a table boundary; retain upstream cell gestures and repairs. */
export const faithfulTableSelection = $prose(() => {
  const base = tableEditing({ allowTableNodeSelection: true });
  return new Plugin({ ...base.spec, appendTransaction(transactions, oldState, state) {
    const selection = state.selection;
    if (selection instanceof TextSelection && tableAt(selection.$from) !== tableAt(selection.$to)) return fixTables(state, oldState);
    return base.spec.appendTransaction?.call(this, transactions, oldState, state);
  } });
});
