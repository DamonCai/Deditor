import { linkSchema } from "@milkdown/kit/preset/commonmark";
import type { SourceNode } from "./document";

type ReferenceNode = SourceNode & { identifier?: string; label?: string; referenceType?: string; url?: string; title?: string; reference?: unknown };

/** Resolve link references for editing, retaining their original Markdown identity. */
export function referenceLinks(tree: SourceNode) {
  const definitions = new Map<string, ReferenceNode>();
  const key = (value = "") => value.replace(/\s+/g, " ").trim().toUpperCase();
  tree.children?.forEach((node: ReferenceNode) => {
    if (node.type === "definition" && !definitions.has(key(node.identifier))) definitions.set(key(node.identifier), node);
  });
  const visit = (node: ReferenceNode) => {
    if (node.type === "linkReference" || node.type === "imageReference") {
      const definition = definitions.get(key(node.identifier));
      if (definition) {
        node.reference = { identifier: node.identifier, label: node.label, referenceType: "full", href: definition.url, title: definition.title ?? null };
        node.type = node.type === "linkReference" ? "link" : "image"; node.url = definition.url; node.title = definition.title;
      }
    }
    node.children?.forEach(visit);
  };
  visit(tree);
}

export const faithfulLink = linkSchema.extendSchema(previous => ctx => {
  const base = previous(ctx);
  return { ...base, attrs: { ...base.attrs, reference: { default: null } },
    // Do not leak reference bookkeeping into HTML attributes.
    toDOM: mark => base.toDOM!(Object.assign(Object.create(mark), { attrs: { href: mark.attrs.href, title: mark.attrs.title } }), false),
    parseMarkdown: { ...base.parseMarkdown, runner: (state, node, type) => {
      state.openMark(type, { href: node.url, title: node.title ?? null, reference: node.reference ?? null });
      state.next(node.children); state.closeMark(type);
    } },
    toMarkdown: { ...base.toMarkdown, runner: (state, mark, node) => {
      const reference = mark.attrs.reference;
      if (reference && reference.href === mark.attrs.href && reference.title === mark.attrs.title) {
        state.withMark(mark, "linkReference", undefined, { identifier: reference.identifier, label: reference.label, referenceType: "full" });
      } else base.toMarkdown.runner(state, mark, node);
    } },
  };
});
