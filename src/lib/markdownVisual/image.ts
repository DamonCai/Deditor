import { imageBlockSchema } from "@milkdown/kit/component/image-block";
import type { NodeViewConstructor } from "@milkdown/kit/prose/view";

/** Standard Markdown alt text belongs to the image, never to its resize ratio. */
export const faithfulImage = imageBlockSchema.extendSchema(previous => ctx => {
  const base = previous(ctx);
  return { ...base, attrs: { ...base.attrs, alt: { default: "", validate: "string" } },
    parseDOM: [{ tag: 'img[data-type="image-block"]', getAttrs: dom => ({ src: dom.getAttribute("src") ?? "", caption: dom.getAttribute("caption") ?? "", alt: dom.getAttribute("alt") ?? "", ratio: 1 }) }],
    parseMarkdown: { ...base.parseMarkdown, runner: (state, node, type) => state.addNode(type, { src: node.url, caption: node.title ?? "", alt: node.alt ?? "", ratio: 1 }) },
    toMarkdown: { ...base.toMarkdown, runner: (state, node) => {
      state.openNode("paragraph").addNode("image", undefined, undefined, { title: node.attrs.caption || null, url: node.attrs.src, alt: node.attrs.alt }).closeNode();
    } },
  };
});

/** Keep upstream controls, updating their readonly state even when the node is unchanged. */
export function accessibleImageView(original: NodeViewConstructor): NodeViewConstructor {
  return (initial, view, getPos, decorations, innerDecorations) => {
    let node = initial;
    const result = original(initial, view, getPos, decorations, innerDecorations);
    const dom = result.dom as HTMLElement;
    const updateAlt = () => dom.querySelectorAll("img").forEach(img => { if (img.alt !== node.attrs.alt) img.alt = node.attrs.alt; });
    const observer = new MutationObserver(updateAlt); observer.observe(dom, { childList: true, subtree: true });
    const modeChanged = () => { result.update?.(node, decorations, innerDecorations); };
    view.dom.addEventListener("deditor-editable-change", modeChanged); updateAlt();
    return { ...result, update(next, deco, inner) {
      const accepted = result.update?.(next, deco, inner) ?? false;
      if (accepted) { node = next; decorations = deco; innerDecorations = inner; updateAlt(); }
      return accepted;
    }, destroy() { observer.disconnect(); view.dom.removeEventListener("deditor-editable-change", modeChanged); result.destroy?.(); } };
  };
}
