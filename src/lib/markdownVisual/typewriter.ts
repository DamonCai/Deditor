import type { EditorView } from "@milkdown/kit/prose/view";
import { useEditorStore } from "../../store/editor";

/** Explicit opt-in only. Never recenter a composition or react to manual scrolling. */
export function installTypewriter(view: EditorView, scroller: HTMLElement) {
  let frame = 0, composing = false, settled = 0, destroyed = false;
  const cancel = () => { cancelAnimationFrame(frame); frame = 0; };
  const start = () => { composing = true; cancel(); clearTimeout(settled); };
  const end = () => { settled = window.setTimeout(() => { composing = false; }, 50); };
  view.dom.addEventListener("compositionstart", start, true);
  view.dom.addEventListener("compositionend", end, true);
  return {
    update() {
      if (destroyed || composing || view.composing || !view.editable || !view.hasFocus() || !useEditorStore.getState().markdownSettings.typewriter) return;
      cancel();
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (composing || view.composing || !view.hasFocus() || !useEditorStore.getState().markdownSettings.typewriter) return;
        const caret = view.coordsAtPos(view.state.selection.head), bounds = scroller.getBoundingClientRect();
        const delta = (caret.top + caret.bottom) / 2 - (bounds.top + bounds.bottom) / 2;
        if (Math.abs(delta) > 2) scroller.scrollTop = Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight, scroller.scrollTop + delta));
      });
    },
    destroy() { destroyed = true; cancel(); clearTimeout(settled); view.dom.removeEventListener("compositionstart", start, true); view.dom.removeEventListener("compositionend", end, true); },
  };
}
