import { $prose } from '@milkdown/kit/utils';
import { Plugin } from '@milkdown/kit/prose/state';
import { CellSelection, TableMap, moveTableColumn, moveTableRow } from '@milkdown/kit/prose/tables';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';

export function tableDropIndex(elements: Element[], coordinate: number, axis: 'row' | 'col') {
  const index = elements.findIndex(element => {
    const rect = element.getBoundingClientRect();
    return coordinate <= (axis === 'row' ? rect.bottom : rect.right);
  });
  return index < 0 ? elements.length - 1 : index;
}

/** Keep Crepe's preview and handles; resolve the actual drop independently of its throttled dragover. */
export function installTableDrop(view: EditorView) {
  let pending: { axis: 'row' | 'col'; from: number; table: HTMLTableElement; wrapper: HTMLElement; pos: number; node: ProseNode; doc: ProseNode } | undefined;
  const elements = (table: HTMLTableElement, axis: 'row' | 'col') => axis === 'row'
    ? Array.from(table.rows) : Array.from(table.rows[0]?.cells ?? []);
  const start = (event: DragEvent) => {
    generation++; pending = undefined;
    if (!view.editable || !(event.target instanceof Element)) return;
    const handle = event.target.closest<HTMLElement>('[data-role="row-drag-handle"], [data-role="col-drag-handle"]');
    if (!handle || !view.dom.contains(handle)) return;
    const wrapper = handle.parentElement;
    const table = wrapper?.querySelector<HTMLTableElement>('.table-wrapper > table');
    if (!wrapper || !table) return;
    const axis = handle.dataset.role === 'row-drag-handle' ? 'row' : 'col';
    const from = tableDropIndex(elements(table, axis), axis === 'row' ? event.clientY : event.clientX, axis);
    if (from < 0) return;
    let pos: number | undefined;
    view.state.doc.descendants((node, at) => { if (node.type.name === 'table' && view.nodeDOM(at)?.contains(table)) pos = at + 1; });
    if (pos === undefined) return;
    pending = { axis, from, table, wrapper, pos, node: view.state.doc.nodeAt(pos - 1)!, doc: view.state.doc };
  };
  let generation = 0;
  const hide = (wrapper: HTMLElement) => wrapper.querySelectorAll<HTMLElement>('.drag-preview, .line-handle').forEach(element => { element.dataset.show = 'false'; });
  const clear = () => {
    const drag = pending; pending = undefined;
    if (!drag) return;
    hide(drag.wrapper);
    const ticket = generation;
    requestAnimationFrame(() => { if (generation === ticket && !pending) hide(drag.wrapper); });
  };
  const drop = (event: DragEvent) => {
    const drag = pending;
    clear();
    if (!drag || !view.editable) return;
    const { axis, from, pos } = drag;
    if (view.state.doc !== drag.doc || !view.state.doc.nodeAt(pos - 1)?.eq(drag.node)) return;
    const host = view.nodeDOM(pos - 1);
    const table = host instanceof Element ? host.querySelector<HTMLTableElement>('.table-wrapper > table') : null;
    const wrapper = table?.parentElement?.parentElement;
    if (!table || !wrapper) return;
    // An outside drop cancels this table move without consuming unrelated drop handlers.
    wrapper.querySelectorAll<HTMLElement>('.drag-preview, .line-handle').forEach(element => { element.dataset.show = 'false'; });
    if (!(event.target instanceof Node) || !wrapper.contains(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    const to = Math.max(0, tableDropIndex(elements(table, axis), axis === 'row' ? event.clientY : event.clientX, axis));
    // Hide the upstream preview before its queued dragover can update stale indices.
    wrapper.querySelectorAll<HTMLElement>('.drag-preview, .line-handle').forEach(element => { element.dataset.show = 'false'; });
    if (from === to || to < 0) return;
    const node = view.state.doc.nodeAt(pos - 1)!;
    const map = TableMap.get(node);
    if (from >= (axis === 'row' ? map.height : map.width) || to >= (axis === 'row' ? map.height : map.width)) return;
    const first = pos + map.positionAt(axis === 'row' ? from : 0, axis === 'col' ? from : 0, node);
    const last = pos + map.positionAt(axis === 'row' ? from : map.height - 1, axis === 'col' ? from : map.width - 1, node);
    view.dispatch(view.state.tr.setSelection(new CellSelection(view.state.doc.resolve(first), view.state.doc.resolve(last))));
    const move = axis === 'row' ? moveTableRow : moveTableColumn;
    move({ from, to, pos })(view.state, transaction => view.dispatch(transaction.setMeta('uiEvent', 'drop')));
    view.focus();
  };
  view.dom.addEventListener('dragstart', start, true);
  window.addEventListener('drop', drop, true);
  window.addEventListener('dragend', clear, true);
  return () => {
    view.dom.removeEventListener('dragstart', start, true);
    window.removeEventListener('drop', drop, true);
    window.removeEventListener('dragend', clear, true);
  };
}
export const accurateTableDrop = $prose(() => new Plugin({ view: view => ({ destroy: installTableDrop(view) }) }));
