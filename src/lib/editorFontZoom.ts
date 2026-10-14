import { useEditorStore } from "../store/editor";
import { isEnabled } from "./shortcuts";

/** Install on the editor scroller, including its gutter, rather than on the
 * window: browser chrome, previews and XMind keep their own scroll behavior. */
export function installEditorFontZoom(scroller: HTMLElement, tabId: string | undefined, onZoom?: () => void): () => void {
  let accumulated = 0;
  let lastTime = 0;
  const onWheel = (event: WheelEvent) => {
    const state = useEditorStore.getState();
    const tab = state.tabs.find((item) => item.id === tabId);
    if (!tab || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey ||
        !isEnabled(state.shortcuts, "editor_font_zoom") ||
        !Number.isFinite(event.deltaY) || event.deltaY === 0) {
      accumulated = 0;
      return;
    }

    // Must be non-passive: suppress document scroll and browser page zoom,
    // including when the editor's existing 10–28px limits have been reached.
    event.preventDefault();
    event.stopPropagation();
    const now = performance.now();
    const delta = event.deltaY * (event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 100 : 1);
    if (now - lastTime > 200 || Math.sign(delta) !== Math.sign(accumulated)) accumulated = 0;
    lastTime = now;
    accumulated += delta;
    const steps = Math.trunc(accumulated / 100);
    if (!steps) return;
    accumulated %= 100;
    // Bound individual high-resolution wheel bursts, while preserving small
    // touchpad deltas until they add up to a deliberate size change.
    state.setEditorZoomFontSize(tab.id, (tab.zoomFontSize ?? state.editorFontSize) - Math.max(-3, Math.min(3, steps)));
    onZoom?.();
  };
  scroller.addEventListener("wheel", onWheel, { passive: false });
  return () => scroller.removeEventListener("wheel", onWheel);
}
