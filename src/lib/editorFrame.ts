type FrameDocumentListener = (document: Document, frame: HTMLIFrameElement) => () => void;

const frames = new Map<HTMLIFrameElement, Document | null>();
const observers = new Set<(frame: HTMLIFrameElement, document: Document | null) => void>();

/** Register only the app-owned editor frame, never embedded Markdown pages. */
export function registerEditorFrame(frame: HTMLIFrameElement): () => void {
  const refresh = () => {
    const next = frame.contentDocument;
    if (frames.get(frame) === next) return;
    frames.set(frame, next);
    observers.forEach(observer => observer(frame, next));
  };
  frame.addEventListener("load", refresh);
  refresh();
  return () => {
    frame.removeEventListener("load", refresh);
    frames.delete(frame);
    observers.forEach(observer => observer(frame, null));
  };
}

/** Listen in each editor document and clean up when its frame is removed or reloaded. */
export function observeEditorFrameDocuments(listener: FrameDocumentListener): () => void {
  const cleanups = new Map<HTMLIFrameElement, () => void>();
  const update = (frame: HTMLIFrameElement, document: Document | null) => {
    cleanups.get(frame)?.();
    cleanups.delete(frame);
    if (document) cleanups.set(frame, listener(document, frame));
  };
  observers.add(update);
  frames.forEach((document, frame) => update(frame, document));
  return () => {
    observers.delete(update);
    cleanups.forEach(cleanup => cleanup());
    cleanups.clear();
  };
}

export function activeEditorElement(doc: Document = document): Element | null {
  let active = doc.activeElement;
  while (active && frames.has(active as HTMLIFrameElement)) {
    const nested = frames.get(active as HTMLIFrameElement)?.activeElement;
    if (!nested) break;
    active = nested;
  }
  return active;
}

export function closeEditorFrameDiagramOverviews(): void {
  frames.forEach(doc => {
    if (doc?.defaultView) doc.dispatchEvent(new doc.defaultView.Event("deditor-close-diagram-overview"));
  });
}
