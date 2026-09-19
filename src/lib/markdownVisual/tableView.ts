import type { NodeViewConstructor } from '@milkdown/kit/prose/view';

/** Keep Crepe's controls, but let ProseMirror own text/cell selection. */
export function stableTableView(create: NodeViewConstructor): NodeViewConstructor {
  return (node, view, getPos, decorations, innerDecorations) => {
    const result = create(node, view, getPos, decorations, innerDecorations);
    const update = result.update?.bind(result), stopEvent = result.stopEvent?.bind(result);
    let current = node;
    result.update = (next, outer, inner) => {
      // Crepe returns false for unchanged content, rebuilding the entire table
      // whenever the current-block decoration moves between cells.
      if (next === current) return true;
      const accepted = update?.(next, outer, inner) ?? false;
      if (accepted) current = next;
      return accepted;
    };
    result.stopEvent = event => {
      // The upstream delayed NodeSelection races mouse drag and can replace
      // a complete row selection with one paragraph after the mouse is up.
      if ((event.type === 'mousedown' || event.type === 'pointerdown')
        && event.target instanceof Node && result.contentDOM?.contains(event.target)) return false;
      return stopEvent?.(event) ?? false;
    };
    return result;
  };
}
