import { imageBlockSchema } from "@milkdown/kit/component/image-block";
import type { NodeViewConstructor } from "@milkdown/kit/prose/view";
import type { SourceNode } from "./document";
import { markdownLabels } from "../markdownPreferences";
const escapeAttribute = (s: string) => s.replace(/[&<>"\n\r]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "\n": "&#10;", "\r": "&#13;" })[c]!);

/** Only promote simple standalone images; arbitrary authored HTML stays lossless. */
export function sizedImages(tree: SourceNode) {
  tree.children = tree.children?.map(block => {
    const node = block.type === "paragraph" && block.children?.length === 1 ? block.children[0] : block;
    if (node.type !== "html" || !/^\s*<img\s[^>]*\/?>\s*$/i.test(node.value ?? "")) return block;
    const parsed = new DOMParser().parseFromString(node.value!, "text/html"), img = parsed.body.firstElementChild;
    if (!img || img.tagName !== "IMG" || [...img.attributes].some(a => !["src", "alt", "title", "width"].includes(a.name))) return block;
    const width = img.getAttribute("width") ?? "";
    if (!/^\d{1,5}$/.test(width) || +width < 1 || +width > 10000 || !img.getAttribute("src")) return block;
    return { type: "image-block", url: img.getAttribute("src"), alt: img.getAttribute("alt") ?? "", title: img.getAttribute("title") ?? "", width: +width, position: block.position } as SourceNode;
  });
}
export const faithfulImage = imageBlockSchema.extendSchema(previous => ctx => {
  const base = previous(ctx);
  return { ...base, attrs: { ...base.attrs, alt: { default: "", validate: "string" }, width: { default: null } },
    parseDOM: [{ tag: 'img[data-type="image-block"]', getAttrs: dom => ({ src: dom.getAttribute("src") ?? "", caption: dom.getAttribute("caption") ?? "", alt: dom.getAttribute("alt") ?? "", width: Number(dom.getAttribute("width")) || null, ratio: 1 }) }],
    parseMarkdown: { ...base.parseMarkdown, runner: (state, node, type) => state.addNode(type, { src: node.url, caption: node.title ?? "", alt: node.alt ?? "", width: node.width ?? null, ratio: 1 }) },
    toMarkdown: { ...base.toMarkdown, runner: (state, node) => {
      const { src, alt, caption, width } = node.attrs;
      if (width) state.addNode("html", undefined, `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" width="${Math.round(width)}"${caption ? ` title="${escapeAttribute(caption)}"` : ""}>`);
      else state.openNode("paragraph").addNode("image", undefined, undefined, { title: caption || null, url: src, alt }).closeNode();
    } },
  };
});

export function accessibleImageView(original: NodeViewConstructor, language: "zh" | "en" = "en"): NodeViewConstructor {
  return (initial, view, getPos, decorations, innerDecorations) => {
    let node = initial;
    const result = original(initial, view, getPos, decorations, innerDecorations);
    const dom = result.dom as HTMLElement;
    const label = document.createElement("label"); label.className = "md-image-width"; label.contentEditable = "false";
    const input = document.createElement("input"); input.type = "number"; input.min = "1"; input.max = "10000"; input.step = "1";
    const labels = markdownLabels[language];
    label.append(document.createTextNode(labels.width + " "), input); input.setAttribute("aria-label", labels.width); input.placeholder = labels.auto;
    dom.append(label);
    const update = () => {
      label.hidden = !view.editable;
      if (document.activeElement !== input) input.value = node.attrs.width ? String(node.attrs.width) : "";
      dom.querySelectorAll("img").forEach(img => {
        if (img.alt !== node.attrs.alt) img.alt = node.attrs.alt;
        img.style.setProperty("width", node.attrs.width ? `${node.attrs.width}px` : "auto", "important");
        img.style.setProperty("max-width", "100%");
      });
    };
    const commitWidth = () => {
      const pos = getPos(); if (!view.editable || pos === undefined) return;
      const width = input.value === "" ? null : Math.max(1, Math.min(10000, Math.round(Number(input.value))));
      if (width !== null && !Number.isFinite(width)) { input.value = node.attrs.width ?? ""; return; }
      if (width !== node.attrs.width) view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, width }));
    };
    input.onchange = commitWidth; input.onblur = commitWidth;
    // Resizing is explicit and persisted. Hide upstream ratio-only drag handles.
    dom.classList.add("md-persisted-image");
    const observer = new MutationObserver(update); observer.observe(dom, { childList: true, subtree: true });
    const modeChanged = () => { result.update?.(node, decorations, innerDecorations); update(); };
    view.dom.addEventListener("deditor-editable-change", modeChanged); update();
    return { ...result, stopEvent(event) { return label.contains(event.target as Node) || (result.stopEvent?.(event) ?? false); }, update(next, deco, inner) {
      const accepted = result.update?.(next, deco, inner) ?? false;
      if (accepted) { node = next; decorations = deco; innerDecorations = inner; update(); }
      return accepted;
    }, destroy() { observer.disconnect(); view.dom.removeEventListener("deditor-editable-change", modeChanged); result.destroy?.(); } };
  };
}
