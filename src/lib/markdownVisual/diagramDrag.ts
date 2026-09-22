import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import { NodeSelection } from '@milkdown/kit/prose/state';
import { isWindowCloseCommitted } from '../windowCloseGuard';

/** Move within the containing block list, preserving quote/list nesting. */
function diagramMoveTarget(view: EditorView, from: number, to: number) {
  if (!view.editable || isWindowCloseCommitted()) return false;
  const node = view.state.doc.nodeAt(from);
  if (!node || node.type.name !== 'code_block' || !/^(mermaid|plantuml|puml|uml)$/i.test(node.attrs.language ?? '')) return false;
  const start = view.state.doc.resolve(from), end = view.state.doc.resolve(to);
  if (start.parent !== end.parent || to >= from && to <= from + node.nodeSize) return false;
  // Check the complete resulting parent, including required leading paragraphs in list items.
  const children: ProseNode[] = []; start.parent.forEach(child => children.push(child));
  children.splice(start.index(), 1);
  children.splice(end.index() - (to > from ? 1 : 0), 0, node);
  const parent = start.parent.type.create(start.parent.attrs, children, start.parent.marks);
  if (!parent.type.validContent(parent.content)) return false;
  const dest = to > from ? to - node.nodeSize : to;
  return { node, dest };
}

export function moveDiagram(view: EditorView, from: number, to: number) {
  const target = diagramMoveTarget(view, from, to);
  if (!target) return false;
  const { node, dest } = target;
  const tr = view.state.tr.delete(from, from + node.nodeSize).insert(dest, node);
  tr.setSelection(NodeSelection.create(tr.doc, dest));
  view.dispatch(tr.setMeta('deditor-list-operation', true).setMeta('uiEvent', 'drop').scrollIntoView());
  view.focus(); return true;
}

export function diagramDrag(view: EditorView, dom: HTMLElement, handle: HTMLButtonElement, getPos: () => number | undefined) {
  type Drag = { doc: ProseNode; from: number; pointer: number; x: number; y: number; currentX: number; currentY: number; active: boolean; target?: number };
  let drag: Drag | undefined, frame = 0;
  const scroll = view.dom.closest<HTMLElement>('.md-visual-scroll');
  const line = document.createElement('div'); line.className = 'md-diagram-drop-line'; line.hidden = true;
  line.setAttribute('aria-hidden', 'true');
  const clear = () => {
    const previous = drag; drag = undefined;
    cancelAnimationFrame(frame); frame = 0; line.remove();
    dom.classList.remove('md-diagram-dragging');
    if (previous && handle.hasPointerCapture?.(previous.pointer)) handle.releasePointerCapture(previous.pointer);
    window.removeEventListener('pointermove', moving, true);
    window.removeEventListener('pointerup', finish, true);
    window.removeEventListener('pointercancel', clear);
    window.removeEventListener('blur', clear);
    window.removeEventListener('keydown', cancelKey, true);
    scroll?.removeEventListener('scroll', indicate);
  };
  const valid = () => !!drag && view.editable && view.state.doc === drag.doc && view.dom.isConnected && !isWindowCloseCommitted() && !dom.closest('[inert]');
  const indicate = () => {
    if (!drag?.active) return;
    if (!valid()) { clear(); return; }
    const bounds = (scroll ?? view.dom).getBoundingClientRect();
    drag.target = undefined; line.hidden = true;
    if (drag.currentX < bounds.left || drag.currentX > bounds.right || drag.currentY < bounds.top || drag.currentY > bounds.bottom) return;
    const resolved = drag.doc.resolve(drag.from), base = resolved.start();
    let target: { pos: number; y: number; left: number; width: number } | undefined;
    resolved.parent.forEach((child, offset) => {
      const pos = base + offset, element = view.nodeDOM(pos);
      if (!(element instanceof HTMLElement) || target && drag!.currentY < target.y) return;
      const rect = element.getBoundingClientRect();
      if (drag!.currentY < rect.top + rect.height / 2) {
        target ??= { pos, y: rect.top, left: rect.left, width: rect.width };
      } else target = { pos: pos + child.nodeSize, y: rect.bottom, left: rect.left, width: rect.width };
    });
    if (!target) return;
    const found = target as { pos: number; y: number; left: number; width: number };
    const source = drag.doc.nodeAt(drag.from)!;
    if (found.pos >= drag.from && found.pos <= drag.from + source.nodeSize) return;
    if (found.y < bounds.top || found.y > bounds.bottom || !diagramMoveTarget(view, drag.from, found.pos)) return;
    drag.target = found.pos; line.hidden = false;
    Object.assign(line.style, { top: `${found.y}px`, left: `${Math.max(bounds.left, found.left)}px`, width: `${Math.min(found.width, bounds.right - Math.max(bounds.left, found.left))}px` });
  };
  const autoscroll = () => {
    frame = 0;
    if (!drag?.active || !valid()) { clear(); return; }
    if (scroll) {
      const rect = scroll.getBoundingClientRect(), y = drag.currentY;
      if (drag.currentX >= rect.left && drag.currentX <= rect.right && y >= rect.top && y <= rect.bottom) {
        const delta = y < rect.top + 44 ? -Math.ceil((rect.top + 44 - y) / 4) : y > rect.bottom - 44 ? Math.ceil((y - rect.bottom + 44) / 4) : 0;
        if (delta) { scroll.scrollTop += delta; indicate(); }
      }
    }
    frame = requestAnimationFrame(autoscroll);
  };
  const moving = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    if (!valid()) { clear(); return; }
    drag.currentX = event.clientX; drag.currentY = event.clientY;
    if (!drag.active && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
    if (!drag.active) {
      drag.active = true; dom.classList.add('md-diagram-dragging'); document.body.append(line);
      frame = requestAnimationFrame(autoscroll);
    }
    event.preventDefault(); indicate();
  };
  const finish = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    moving(event);
    const current = drag, allowed = valid(); clear();
    if (allowed && current?.active && current.target !== undefined) moveDiagram(view, current.from, current.target);
  };
  const cancelKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); clear(); }
  };
  const start = (event: PointerEvent) => {
    if (event.button !== 0 || handle.disabled || handle.hidden || !view.editable || isWindowCloseCommitted() || dom.querySelector('dialog[open]')) return;
    const from = getPos(); if (from === undefined) return;
    clear(); event.preventDefault(); event.stopPropagation(); handle.focus({ preventScroll: true });
    drag = { doc: view.state.doc, from, pointer: event.pointerId, x: event.clientX, y: event.clientY, currentX: event.clientX, currentY: event.clientY, active: false };
    handle.setPointerCapture?.(event.pointerId);
    window.addEventListener('pointermove', moving, true); window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', clear); window.addEventListener('blur', clear);
    window.addEventListener('keydown', cancelKey, true); scroll?.addEventListener('scroll', indicate);
  };
  const key = (event: KeyboardEvent) => {
    if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key) || dom.querySelector('dialog[open]')) return;
    event.preventDefault(); event.stopPropagation();
    const pos = getPos(); if (pos === undefined) return;
    const resolved = view.state.doc.resolve(pos), index = resolved.index(), parent = resolved.parent;
    const direction = event.key === 'ArrowUp' ? -1 : 1;
    if (direction < 0 && index === 0 || direction > 0 && index === parent.childCount - 1) return;
    const to = direction < 0 ? pos - parent.child(index - 1).nodeSize : pos + parent.child(index).nodeSize + parent.child(index + 1).nodeSize;
    if (moveDiagram(view, pos, to)) {
      const dest = direction < 0 ? to : to - parent.child(index).nodeSize;
      (view.nodeDOM(dest) as HTMLElement | null)?.querySelector<HTMLButtonElement>('.md-diagram-drag')?.focus({ preventScroll: true });
    }
  };
  handle.addEventListener('pointerdown', start); handle.addEventListener('keydown', key); handle.addEventListener('lostpointercapture', clear);
  return { cancel: clear, destroy() { clear(); handle.removeEventListener('pointerdown', start); handle.removeEventListener('keydown', key); handle.removeEventListener('lostpointercapture', clear); } };
}
