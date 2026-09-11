/** Keep IME's provisional selection from recentering an already visible caret. */
export function installCompositionViewport(editor: HTMLElement, scroller: HTMLElement) {
  const doc = editor.ownerDocument, win = doc.defaultView!;
  let anchor: number | null = null, composing = false, settlingFrames = 0, frame = 0, destroyed = false;

  const reconcile = () => {
    if (anchor === null || destroyed) return;
    const selection = doc.getSelection();
    if (!selection?.focusNode || !editor.contains(selection.focusNode) || !selection.rangeCount) return;
    // Read the DOM caret, not the model position: marked text may be ahead of the
    // ProseMirror transaction while the platform is replacing a candidate word.
    const range = doc.createRange();
    range.setStart(selection.focusNode, selection.focusOffset); range.collapse(true);
    const rect = Array.from(range.getClientRects()).find(rect => rect.height > 0);
    if (!rect) return;
    const viewport = scroller.getBoundingClientRect();
    const top = viewport.top + scroller.clientTop, bottom = top + scroller.clientHeight;
    // Express the current caret in the viewport we had before native auto-scroll.
    const caretTop = rect.top + scroller.scrollTop - anchor;
    const caretBottom = rect.bottom + scroller.scrollTop - anchor;
    if (caretTop < top) anchor += caretTop - top - 5;
    else if (caretBottom > bottom) anchor += caretBottom - bottom + 5;
    const next = Math.max(0, Math.min(anchor, scroller.scrollHeight - scroller.clientHeight));
    if (Math.abs(scroller.scrollTop - next) > 0.5) scroller.scrollTop = next;
    anchor = scroller.scrollTop;
  };
  const schedule = () => {
    if (anchor === null || frame || destroyed) return;
    frame = win.requestAnimationFrame(() => {
      frame = 0; reconcile();
      if (!composing) {
        if (--settlingFrames > 0) schedule();
        else anchor = null;
      }
    });
  };
  const start = () => { composing = true; anchor = scroller.scrollTop; schedule(); };
  const end = () => { composing = false; settlingFrames = 2; schedule(); };
  // A deliberate scroll or a new mouse selection always wins over IME anchoring.
  const release = () => { anchor = null; };
  editor.addEventListener("compositionstart", start, true);
  editor.addEventListener("compositionend", end, true);
  editor.addEventListener("input", schedule, true);
  doc.addEventListener("selectionchange", schedule);
  scroller.addEventListener("scroll", schedule, { passive: true });
  scroller.addEventListener("wheel", release, { passive: true });
  scroller.addEventListener("touchmove", release, { passive: true });
  scroller.addEventListener("pointerdown", release, true);
  return {
    handleScroll() {
      if (anchor === null) return false;
      reconcile(); schedule(); return true;
    },
    destroy() {
      destroyed = true; anchor = null; win.cancelAnimationFrame(frame);
      editor.removeEventListener("compositionstart", start, true);
      editor.removeEventListener("compositionend", end, true);
      editor.removeEventListener("input", schedule, true);
      doc.removeEventListener("selectionchange", schedule);
      scroller.removeEventListener("scroll", schedule);
      scroller.removeEventListener("wheel", release);
      scroller.removeEventListener("touchmove", release);
      scroller.removeEventListener("pointerdown", release, true);
    },
  };
}
