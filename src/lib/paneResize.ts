/** A pane resize owns its pointer gesture; it must never start text selection. */
export function beginPaneResize(handle: HTMLElement, event: PointerEvent, move: (event: PointerEvent) => void) {
  if (event.button !== 0 || event.isPrimary === false) return () => {};
  event.preventDefault();
  const doc = handle.ownerDocument, win = doc.defaultView!;
  const id = event.pointerId;
  let finished = false;
  const preventSelection = (event: Event) => event.preventDefault();
  const finish = () => {
    if (finished) return;
    finished = true;
    win.removeEventListener('pointermove', onMove);
    win.removeEventListener('pointerup', onEnd);
    win.removeEventListener('pointercancel', onEnd);
    win.removeEventListener('blur', finish);
    handle.removeEventListener('lostpointercapture', finish);
    doc.removeEventListener('selectstart', preventSelection, true);
    doc.body.classList.remove('deditor-pane-resizing');
    handle.classList.remove('dragging');
    if (handle.hasPointerCapture?.(id)) handle.releasePointerCapture(id);
  };
  const onMove = (event: PointerEvent) => {
    if (event.pointerId !== id) return;
    if (!(event.buttons & 1) || !handle.isConnected) { finish(); return; }
    event.preventDefault();
    move(event);
  };
  const onEnd = (event: PointerEvent) => { if (event.pointerId === id) finish(); };
  doc.body.classList.add('deditor-pane-resizing');
  handle.classList.add('dragging');
  doc.addEventListener('selectstart', preventSelection, true);
  win.addEventListener('pointermove', onMove);
  win.addEventListener('pointerup', onEnd);
  win.addEventListener('pointercancel', onEnd);
  win.addEventListener('blur', finish);
  handle.addEventListener('lostpointercapture', finish);
  handle.setPointerCapture?.(id);
  return finish;
}
