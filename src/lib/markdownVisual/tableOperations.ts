import type { EditorView } from '@milkdown/kit/prose/view';
import { Selection } from '@milkdown/kit/prose/state';
import { isInTable, selectedRect, TableMap } from '@milkdown/kit/prose/tables';

/** A batch is one structural edit, including insertion before the GFM header. */
export function insertTableItems(view: EditorView, axis: 'row' | 'column', before: boolean, count: number) {
  if (!view.editable || !isInTable(view.state) || !Number.isInteger(count) || count < 1 || count > 100) return false;
  const { table, tableStart, top, bottom, left, right } = selectedRect(view.state);
  const { schema } = view.state;
  const index = axis === 'row' ? before ? top : bottom : before ? left : right;
  const rows = Array.from({ length: table.childCount }, (_, r) => table.child(r));
  if (axis === 'row') {
    const header = table.firstChild!;
    const empty = Array.from({ length: count }, () => schema.nodes.table_row.create(null,
      Array.from({ length: header.childCount }, (_, c) => schema.nodes.table_cell.createAndFill(header.child(c).attrs)!)));
    rows.splice(index, 0, ...empty);
    if (index === 0) {
      rows[0] = schema.nodes.table_header_row.create(null, Array.from({ length: header.childCount }, (_, c) => schema.nodes.table_header.createAndFill(header.child(c).attrs)!));
      rows[count] = schema.nodes.table_row.create(null, Array.from({ length: header.childCount }, (_, c) => {
        const cell = header.child(c); return schema.nodes.table_cell.create(cell.attrs, cell.content, cell.marks);
      }));
    }
  } else {
    rows.forEach((row, r) => {
      const cells = Array.from({ length: row.childCount }, (_, c) => row.child(c));
      const type = r === 0 ? schema.nodes.table_header : schema.nodes.table_cell;
      cells.splice(index, 0, ...Array.from({ length: count }, () => type.createAndFill()!));
      rows[r] = row.type.create(row.attrs, cells, row.marks);
    });
  }
  const replacement = table.type.create(table.attrs, rows, table.marks);
  const tr = view.state.tr.replaceWith(tableStart - 1, tableStart - 1 + table.nodeSize, replacement);
  const map = TableMap.get(replacement), cell = map.positionAt(axis === 'row' ? index : top, axis === 'column' ? index : left, replacement);
  tr.setSelection(Selection.near(tr.doc.resolve(tableStart + cell + 1)));
  view.dispatch(tr.setMeta('deditor-list-operation', true).scrollIntoView()); view.focus(); return true;
}

export function alignTableCells(view: EditorView, axis: 'horizontal' | 'vertical', value: string) {
  if (!view.editable || !isInTable(view.state)) return false;
  if (!(axis === 'horizontal' ? ['left', 'center', 'right'] : ['top', 'middle', 'bottom']).includes(value)) return false;
  const rect = selectedRect(view.state), tr = view.state.tr;
  // Pipe-table horizontal alignment belongs to the whole column. Vertical
  // alignment is a cell property and follows the selected rectangle.
  const start = axis === 'horizontal' ? 0 : rect.top, end = axis === 'horizontal' ? rect.map.height : rect.bottom;
  const positions = new Set<number>();
  for (let r = start; r < end; r++) for (let c = rect.left; c < rect.right; c++) positions.add(rect.map.map[r * rect.map.width + c]);
  for (const pos of positions) {
    const cell = rect.table.nodeAt(pos)!;
    tr.setNodeMarkup(rect.tableStart + pos, undefined, { ...cell.attrs, [axis === 'horizontal' ? 'alignment' : 'verticalAlignment']: value === 'top' ? null : value });
  }
  view.dispatch(tr.setMeta('deditor-list-operation', true)); view.focus(); return true;
}
