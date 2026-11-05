/** A visual editor can adopt app-created nodes or create nodes in its own frame. */
export function isDomNode(value: unknown): value is Node {
  if (value instanceof Node) return true;
  if (!value || typeof value !== "object" || !("ownerDocument" in value)) return false;
  const owner = value.ownerDocument as Document | null;
  const Constructor = (owner?.defaultView as (Window & typeof globalThis) | null | undefined)?.Node;
  return !!Constructor && value instanceof Constructor;
}

export function isDomElement(value: unknown): value is Element {
  return isDomNode(value) && value.nodeType === Node.ELEMENT_NODE;
}

export function isHtmlElement(value: unknown): value is HTMLElement {
  return isDomElement(value) && value.namespaceURI === "http://www.w3.org/1999/xhtml";
}

export function isInputElement(value: unknown): value is HTMLInputElement {
  return isHtmlElement(value) && value.localName === "input";
}

export function editorWindow(node: Node): Window {
  return node.ownerDocument?.defaultView ?? window;
}

/** Convert an editor point to the app viewport for a top-level floating control. */
export function appViewportOffset(node: Node) {
  const frame = node.ownerDocument?.defaultView?.frameElement;
  if (!frame) return { x: 0, y: 0 };
  const rect = frame.getBoundingClientRect();
  return { x: rect.left, y: rect.top };
}
