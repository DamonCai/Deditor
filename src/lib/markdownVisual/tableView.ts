import { blockDrag } from './diagramDrag';
import { tStatic } from '../i18n';
import type { NodeViewConstructor } from '@milkdown/kit/prose/view';

/** Keep Crepe's controls, but let ProseMirror own text/cell selection. */
export function stableTableView(create: NodeViewConstructor): NodeViewConstructor {
  return (node, view, getPos, decorations, innerDecorations) => {
    // Crepe's Vue table schedules a mount frame that captures its EditorView,
    // but does not cancel it on unmount. Hidden WebViews can suspend those
    // frames indefinitely and retain every closed table/editor. Own only the
    // frames scheduled synchronously by this factory; restore the scheduler
    // before returning so other views keep their independent frame lifecycle.
    const frames = new Set<number>();
    const requestFrame = globalThis.requestAnimationFrame;
    const cancelFrame = globalThis.cancelAnimationFrame;
    let disposed = false;
    const releaseFrames = () => {
      disposed = true;
      for (const id of frames) cancelFrame.call(globalThis, id);
      frames.clear();
    };
    globalThis.requestAnimationFrame = callback => {
      const id = requestFrame.call(globalThis, time => {
        frames.delete(id);
        if (!disposed) callback(time);
      });
      frames.add(id);
      return id;
    };
    let result: ReturnType<NodeViewConstructor>;
    try {
      result = create(node, view, getPos, decorations, innerDecorations);
    } catch (error) {
      releaseFrames();
      throw error;
    } finally {
      globalThis.requestAnimationFrame = requestFrame;
    }
    // Keep the whole-table handle outside contentDOM, separate from Crepe's
    // row/column handles and from the Markdown/clipboard projection.
    const handle = document.createElement('button');
    handle.type = 'button'; handle.className = 'deditor-btn md-table-drag';
    handle.dataset.variant = 'ghost'; handle.contentEditable = 'false';
    handle.textContent = '⠿'; handle.title = tStatic('md.moveTable');
    handle.setAttribute('aria-label', handle.title);
    const host = result.dom as HTMLElement;
    host.prepend(handle);
    const drag = blockDrag(view, host, handle, getPos);
    const editable = () => { handle.hidden = !view.editable; handle.disabled = !view.editable; if (!view.editable) drag.cancel(); };
    editable(); view.dom.addEventListener('deditor-editable-change', editable);
    const destroy = result.destroy?.bind(result);
    result.destroy = () => {
      drag.destroy(); view.dom.removeEventListener('deditor-editable-change', editable);
      releaseFrames();
      destroy?.();
    };
    const update = result.update?.bind(result), stopEvent = result.stopEvent?.bind(result);
    let current = node;
    const applyIndent = (value: typeof node) => {
      if (!(result.dom instanceof HTMLElement)) return;
      const level = Number.isSafeInteger(value.attrs.indent) && value.attrs.indent > 0 ? value.attrs.indent : 0;
      result.dom.style.marginInlineStart = level ? `${level * 2}em` : '';
      result.dom.style.maxWidth = level ? `calc(100% - ${level * 2}em)` : '';
      if (level) result.dom.dataset.deditorTableIndent = String(level);
      else delete result.dom.dataset.deditorTableIndent;
    };
    applyIndent(node);
    result.update = (next, outer, inner) => {
      // Crepe returns false for unchanged content, rebuilding the entire table
      // whenever the current-block decoration moves between cells.
      if (next === current) return true;
      const accepted = update?.(next, outer, inner) ?? false;
      if (accepted) { current = next; applyIndent(next); }
      return accepted;
    };
    result.stopEvent = event => {
      if (event.target instanceof Node && handle.contains(event.target)) return true;
      // The upstream delayed NodeSelection races mouse drag and can replace
      // a complete row selection with one paragraph after the mouse is up.
      if ((event.type === 'mousedown' || event.type === 'pointerdown')
        && event.target instanceof Node && result.contentDOM?.contains(event.target)) return false;
      return stopEvent?.(event) ?? false;
    };
    return result;
  };
}
