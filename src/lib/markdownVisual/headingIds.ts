import { $prose } from "@milkdown/kit/utils";
import { Plugin } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { sourceTree, type SourceNode } from "./document";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
function plain(node: SourceNode): string {
  return ["text", "inlineCode"].includes(node.type) ? node.value ?? (node as SourceNode & { alt?: string }).alt ?? "" : node.children?.map(plain).join("") ?? "";
}
const rawHeadings = new WeakMap<object, string[]>();
const headingDecorations = new WeakMap<ProseNode, DecorationSet>();
/** Match markdown-it-anchor, including duplicate headings, without source/history transactions. */
export const sharedHeadingIds = $prose(() => new Plugin({ props: { decorations(state) {
  const cached = headingDecorations.get(state.doc);
  if (cached) return cached;
  const used = new Set<string>(), decorations: Decoration[] = [];
  const id = (text: string) => {
    const base = encodeURIComponent(text.trim().toLowerCase().replace(/\s+/g, "-"));
    let result = base, suffix = 1; while (used.has(result)) result = `${base}-${suffix++}`;
    used.add(result); return result;
  };
  state.doc.descendants((node, pos) => {
    if (node.type.name === "deditor_raw") {
      let headings = rawHeadings.get(node);
      if (!headings) { headings = []; const walk = (n: SourceNode) => { if (n.type === "heading") headings!.push(plain(n)); n.children?.forEach(walk); }; walk(sourceTree(node.textContent)); rawHeadings.set(node, headings); }
      headings.forEach(id); return false;
    }
    if (node.type.name !== "heading") return;
    let text = "";
    node.descendants(child => {
      if (child.type.name === "deditor_inline_source") { text += plain(sourceTree(child.textContent)); return false; }
      if (child.isText) text += child.text;
      else if (child.type.name === "deditor_emoji") text += `:${child.attrs.name}:`;
    });
    decorations.push(Decoration.node(pos, pos + node.nodeSize, { id: id(text) }));
    return false;
  });
  const result = DecorationSet.create(state.doc, decorations);
  headingDecorations.set(state.doc, result);
  return result;
} } }));
