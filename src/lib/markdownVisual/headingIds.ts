import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { sourceTree, type SourceNode } from "./document";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
function plain(node: SourceNode): string {
  return ["text", "inlineCode"].includes(node.type) ? node.value ?? (node as SourceNode & { alt?: string }).alt ?? "" : node.children?.map(plain).join("") ?? "";
}
const rawHeadings = new WeakMap<object, string[]>();
const headingText = new WeakMap<ProseNode, string>();
const key = new PluginKey<DecorationSet>("deditor-heading-ids");
/** Match markdown-it-anchor, including duplicate headings, without source/history transactions. */
function headingDecorations(doc: ProseNode) {
  const used = new Set<string>(), decorations: Decoration[] = [];
  const id = (text: string) => {
    const base = encodeURIComponent(text.trim().toLowerCase().replace(/\s+/g, "-"));
    let result = base, suffix = 1; while (used.has(result)) result = `${base}-${suffix++}`;
    used.add(result); return result;
  };
  doc.descendants((node, pos) => {
    if (node.type.name === "deditor_raw") {
      let headings = rawHeadings.get(node);
      if (!headings) { headings = []; const walk = (n: SourceNode) => { if (n.type === "heading") headings!.push(plain(n)); n.children?.forEach(walk); }; walk(sourceTree(node.textContent)); rawHeadings.set(node, headings); }
      headings.forEach(id); return false;
    }
    if (node.type.name !== "heading") return;
    const cached = headingText.get(node);
    let text = cached ?? "";
    if (cached === undefined) {
      node.descendants(child => {
        if (child.type.name === "deditor_inline_source") { text += plain(sourceTree(child.textContent)); return false; }
        if (child.isText) text += child.text ?? "";
        else if (child.type.name === "deditor_emoji") text += `:${child.attrs.name}:`;
      });
      headingText.set(node, text);
    }
    const headingId = id(text);
    decorations.push(Decoration.node(pos, pos + node.nodeSize, { id: headingId }, { headingId }));
    return false;
  });
  return decorations;
}

export function createHeadingIdsPlugin() {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_config, state) => DecorationSet.create(state.doc, headingDecorations(state.doc)),
      apply(tr, previous) {
        if (!tr.docChanged) return previous;
        const mapped = previous.map(tr.mapping, tr.doc);
        const existing = new Map(mapped.find().map(decoration => [decoration.from, decoration]));
        const added: Decoration[] = [];
        for (const next of headingDecorations(tr.doc)) {
          const old = existing.get(next.from);
          if (old && old.to === next.to && old.spec.headingId === next.spec.headingId) existing.delete(next.from);
          else added.push(next);
        }
        // Rebuilding all heading decorations scans every document child for
        // every heading. Retain the mapped tree and only replace changed IDs.
        return mapped.remove([...existing.values()]).add(tr.doc, added);
      },
    },
    props: { decorations: state => key.getState(state) },
  });
}
export const sharedHeadingIds = $prose(createHeadingIdsPlugin);
