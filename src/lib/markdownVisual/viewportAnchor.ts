import type { EditorView } from "@milkdown/kit/prose/view";

export interface ViewportAnchor { pos: number; offset: number }

/** Pixel scroll alone cannot survive rebuilding estimated offscreen heights. */
export function captureViewportAnchor(view: EditorView, scroll: HTMLElement): ViewportAnchor | undefined {
  if (!scroll.scrollTop) return;
  const top = scroll.getBoundingClientRect().top, blocks = view.dom.children;
  if (!blocks.length) return;
  // The caller excludes authored CSS. Root blocks stay in document order;
  // logarithmic geometry reads also work in centered/narrow document themes.
  let low = 0, high = blocks.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (blocks[middle].getBoundingClientRect().top <= top + 16) low = middle + 1;
    else high = middle;
  }
  const element = blocks[Math.max(0, low - 1)];
  try {
    return { pos: view.posAtDOM(view.dom, Array.prototype.indexOf.call(view.dom.childNodes, element)),
      offset: element.getBoundingClientRect().top - top };
  } catch { return; }
}

export function restoreViewportAnchor(view: EditorView, scroll: HTMLElement, anchor: ViewportAnchor,
  materialize: (pos: number) => void): boolean {
  if (anchor.pos < 0 || anchor.pos >= view.state.doc.content.size) return false;
  materialize(anchor.pos);
  const element = view.nodeDOM(anchor.pos);
  if (element?.nodeType !== 1) return false;
  scroll.scrollTop += (element as HTMLElement).getBoundingClientRect().top - scroll.getBoundingClientRect().top - anchor.offset;
  return true;
}
