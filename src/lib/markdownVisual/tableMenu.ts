import { $prose } from "@milkdown/kit/utils";
import { Plugin, Selection } from "@milkdown/kit/prose/state";
import { CellSelection, TableMap, selectedRect, isInTable, deleteColumn, deleteTable } from "@milkdown/kit/prose/tables";
import type { EditorView } from "@milkdown/kit/prose/view";
import { tStatic } from "../i18n";

export function deleteTableColumns(view: EditorView) {
  if (!view.editable || !isInTable(view.state)) return;
  const { left, right, map } = selectedRect(view.state);
  const command = left === 0 && right === map.width ? deleteTable : deleteColumn;
  command(view.state, tr => view.dispatch(tr.setMeta('deditor-list-operation', true).scrollIntoView()));
  view.focus();
}

export function deleteTableRows(view: EditorView) {
  if (!view.editable) return;
  const { table, tableStart, top, bottom } = selectedRect(view.state);
  const rows = Array.from({ length: table.childCount }, (_, i) => table.child(i)).filter((_, i) => i < top || i >= bottom);
  const tr = view.state.tr;
  if (!rows.length) tr.delete(tableStart - 1, tableStart - 1 + table.nodeSize);
  else {
    if (top === 0) {
      const header = table.firstChild!;
      const cells = Array.from({ length: rows[0].childCount }, (_, i) => {
        const cell = rows[0].child(i);
        return header.firstChild!.type.create(cell.attrs, cell.content, cell.marks);
      });
      rows[0] = header.type.create(rows[0].attrs, cells, rows[0].marks);
    }
    const replacement = table.type.create(table.attrs, rows, table.marks);
    tr.replaceWith(tableStart - 1, tableStart - 1 + table.nodeSize, replacement);
    const cell = TableMap.get(replacement).positionAt(Math.min(top, rows.length - 1), 0, replacement);
    tr.setSelection(Selection.near(tr.doc.resolve(tableStart + cell + 1)));
  }
  view.dispatch(tr.setMeta('deditor-list-operation', true).scrollIntoView());
  view.focus();
}

/** Keep upstream table controls within their scroll viewport without changing document flow. */
export const tableMenuPlacement = $prose(() => new Plugin({
  view(view) {
    let menu: HTMLElement | undefined;
    const close = () => { menu?.remove(); menu = undefined; };
    const open = (event: MouseEvent | KeyboardEvent) => {
      if (!view.editable || !(event.target instanceof Element)) return;
      const keyboard = event.type === 'keydown';
      const selection = view.state.selection;
      const cell = keyboard ? selection instanceof CellSelection
        ? view.nodeDOM(selection.$headCell.pos) as HTMLElement | null
        : view.domAtPos(selection.head).node.parentElement?.closest('td,th') : event.target.closest('td,th');
      if (!cell || !view.dom.contains(cell)) return;
      event.preventDefault(); event.stopPropagation(); close();
      const at = view.state.doc.resolve(view.posAtDOM(cell, 0));
      let depth = at.depth;
      while (depth && !['table_cell', 'table_header'].includes(at.node(depth).type.name)) depth--;
      if (!depth) return;
      const cellPos = at.before(depth);
      const current = view.state.selection;
      let contained = false;
      if (current instanceof CellSelection) current.forEachCell((_, pos) => { if (pos === cellPos) contained = true; });
      if (!contained) view.dispatch(view.state.tr.setSelection(Selection.near(at)));
      menu = document.createElement('div'); menu.className = 'md-table-menu'; menu.setAttribute('role', 'menu');
      const action = (key: string, run: () => void) => {
        const button = document.createElement('button'); button.className = 'deditor-btn'; button.dataset.variant = 'ghost'; button.dataset.size = 'sm';
        button.setAttribute('role', 'menuitem'); button.textContent = tStatic(key);
        button.onclick = () => { close(); run(); view.focus(); }; menu!.append(button);
      };
      action('md.selectRow', () => {
        const { table, tableStart, top, bottom } = selectedRect(view.state), map = TableMap.get(table);
        view.dispatch(view.state.tr.setSelection(CellSelection.rowSelection(view.state.doc.resolve(tableStart + map.map[top * map.width]), view.state.doc.resolve(tableStart + map.map[(bottom - 1) * map.width]))));
      });
      action('md.deleteRow', () => deleteTableRows(view));
      action('md.deleteColumn', () => deleteTableColumns(view));
      menu.onmousedown = e => { e.preventDefault(); e.stopPropagation(); };
      menu.onkeydown = e => {
        if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); close(); view.focus(); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); const buttons = Array.from(menu!.querySelectorAll('button'));
          const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
          buttons[(i + (e.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length].focus();
        }
      };
      // Outside the content DOM: menu text never enters clipboard or Markdown.
      view.dom.closest('.md-visual-shell')?.append(menu);
      const rect = cell.getBoundingClientRect(), bounds = menu.getBoundingClientRect();
      const x = keyboard ? rect.left : (event as MouseEvent).clientX, y = keyboard ? rect.bottom : (event as MouseEvent).clientY;
      menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - bounds.width - 4))}px`;
      menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - bounds.height - 4))}px`;
      menu.querySelector('button')?.focus();
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) open(event); };
    const outside = (event: Event) => { if (!(event.target instanceof Node) || !menu?.contains(event.target)) close(); };
    view.dom.addEventListener('contextmenu', open);
    view.dom.addEventListener('keydown', key);
    window.addEventListener('mousedown', outside);
    window.addEventListener('blur', close);
    const scroll = view.dom.closest<HTMLElement>(".md-visual-scroll");
    const pending = new Set<HTMLElement>(); let frame = 0, focusFrame = 0;
    const place = (menu: HTMLElement) => {
      const handle = menu.parentElement;
      if (!handle || handle.dataset.show !== "true" || menu.dataset.show !== "true" || !menu.isConnected) return;
      const viewport = scroll?.getBoundingClientRect();
      const left = Math.max(0, viewport?.left ?? 0) + 4, right = Math.min(window.innerWidth, viewport?.right ?? window.innerWidth) - 4;
      const top = Math.max(0, viewport?.top ?? 0) + 4, bottom = Math.min(window.innerHeight, viewport?.bottom ?? window.innerHeight) - 4;
      const anchor = handle.getBoundingClientRect(), width = menu.offsetWidth, height = menu.offsetHeight;
      const x = Math.max(left, Math.min(anchor.left, right - width));
      const below = anchor.bottom + 8, above = anchor.top - height - 8;
      const y = below + height <= bottom ? below : above >= top ? above : Math.max(top, bottom - height);
      menu.style.left = `${x - anchor.left}px`; menu.style.top = `${y - anchor.top}px`;
      menu.dataset.placement = y < anchor.top ? "above" : "below";
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; pending.forEach(place); pending.clear(); });
    };
    const all = () => {view.dom.querySelectorAll<HTMLElement>('.cell-handle .button-group[data-show="true"]').forEach(menu => pending.add(menu));schedule();};
    const observer = new MutationObserver(records => {
      records.forEach(record => {
        if (!(record.target instanceof HTMLElement)) return;
        const target = record.target;
        if (target.matches('.cell-handle .button-group')) pending.add(target);
        else if (target.matches('.cell-handle')) target.querySelectorAll<HTMLElement>('.button-group').forEach(menu => pending.add(menu));
      });
      if (pending.size) schedule();
    });
    observer.observe(view.dom, {subtree:true,attributes:true,attributeFilter:['data-show']});
    const focusAfterAdd = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.milkdown-table-block .line-handle .add-button')) return;
      if (focusFrame) cancelAnimationFrame(focusFrame);
      focusFrame = requestAnimationFrame(() => {focusFrame = 0;if(view.editable)view.focus();});
    };
    view.dom.addEventListener('click',focusAfterAdd,true);
    scroll?.addEventListener('scroll',all,{passive:true}); window.addEventListener('resize',all);
    return { update(_view, previous) { if (!previous.doc.eq(view.state.doc) || !view.editable) close(); }, destroy() {close();view.dom.removeEventListener('contextmenu',open);view.dom.removeEventListener('keydown',key);window.removeEventListener('mousedown',outside);window.removeEventListener('blur',close);observer.disconnect();view.dom.removeEventListener('click',focusAfterAdd,true);if(focusFrame)cancelAnimationFrame(focusFrame);scroll?.removeEventListener('scroll',all);window.removeEventListener('resize',all);if(frame)cancelAnimationFrame(frame);pending.clear();}};
  },
}));
