import { footnoteReferenceSchema, footnoteDefinitionSchema } from "@milkdown/kit/preset/gfm";
import { $prose } from "@milkdown/kit/utils";
import { blockquoteSchema } from "@milkdown/kit/preset/commonmark";
import { Plugin, Selection } from "@milkdown/kit/prose/state";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { EditorView, NodeViewConstructor } from "@milkdown/kit/prose/view";

export { editableBlockTree } from "./blockTree";

export const editableBlockquote = blockquoteSchema.extendSchema(previous => ctx => {
  const base = previous(ctx);
  return { ...base, attrs: { ...base.attrs, callout: { default: null } },
    parseDOM: [{ tag: "blockquote[data-md-callout]", contentElement: ".md-callout-content", getAttrs: dom => ({ callout: /^(NOTE|TIP|IMPORTANT|WARNING|CAUTION)$/.test(dom.dataset.mdCallout ?? "") ? dom.dataset.mdCallout : null }) }, ...(base.parseDOM ?? [])],
    toDOM: node => node.attrs.callout ? ["blockquote", { class: `md-callout md-callout-${node.attrs.callout.toLowerCase()}`, "data-md-callout": node.attrs.callout }, ["span", { class: "md-callout-title", contenteditable: "false" }, node.attrs.callout], ["div", { class: "md-callout-content" }, 0]] : base.toDOM!(node),
    parseMarkdown: { ...base.parseMarkdown, runner: (state, node, type) => { state.openNode(type, { callout: node.callout ?? null }).next(node.children).closeNode(); } },
    toMarkdown: { ...base.toMarkdown, runner: (state, node) => {
      if (!node.attrs.callout) { base.toMarkdown.runner(state, node); return; }
      state.openNode("blockquote").openNode("paragraph").addNode("text", undefined, `[!${node.attrs.callout}]\n`);
      if (node.firstChild?.type.name === "paragraph") {
        state.next(node.firstChild.content).closeNode();
        node.forEach((child, _offset, index) => { if (index) state.next(child); });
      } else { state.closeNode().next(node.content); }
      state.closeNode();
    } },
  };
});

export const footnoteReference = footnoteReferenceSchema.extendSchema(() => () => ({
  inline: true, group: "inline", atom: true,
  attrs: { label: { default: "", validate: "string" }, identifier: { default: "", validate: "string" } },
  parseDOM: [{ tag: "sup[data-md-footnote]", getAttrs: dom => ({ label: dom.dataset.mdFootnote ?? "", identifier: dom.dataset.mdFootnote ?? "" }) }],
  toDOM: node => ["sup", { class: "footnote-ref", "data-md-footnote": node.attrs.label }, `[${node.attrs.label}]`],
  parseMarkdown: { match: node => node.type === "footnoteReference", runner: (state, node, type) => { state.addNode(type, { label: node.label ?? node.identifier, identifier: node.identifier }); } },
  toMarkdown: { match: node => node.type.name === "footnote_reference", runner: (state, node) => { state.addNode("footnoteReference", undefined, undefined, { identifier: node.attrs.identifier, label: node.attrs.label }); } },
}));
export const footnoteDefinition = footnoteDefinitionSchema.extendSchema(() => () => ({
  group: "block", content: "block+", defining: true,
  attrs: { label: { default: "", validate: "string" }, identifier: { default: "", validate: "string" } },
  parseDOM: [{ tag: "section[data-md-footnote-definition]", contentElement: ".md-footnote-content", getAttrs: dom => ({ label: dom.dataset.mdFootnoteDefinition ?? "", identifier: dom.dataset.mdFootnoteDefinition ?? "" }) }],
  toDOM: node => ["section", { class: "footnotes", "data-md-footnote-definition": node.attrs.label }, ["div", { class: "md-footnote-content" }, 0]],
  parseMarkdown: { match: node => node.type === "footnoteDefinition", runner: (state, node, type) => { state.openNode(type, { label: node.label ?? node.identifier, identifier: node.identifier }).next(node.children).closeNode(); } },
  toMarkdown: { match: node => node.type.name === "footnote_definition", runner: (state, node) => { state.openNode("footnoteDefinition", undefined, { identifier: node.attrs.identifier, label: node.attrs.label }).next(node.content).closeNode(); } },
}));

type FootnoteInfo = { number: number; text: string; definition?: number; references: number[] };
const contexts = new WeakMap<ProseNode, Map<string, FootnoteInfo>>();
const key = (label: string) => label.trim().replace(/\s+/g, " ").toLowerCase();
export function footnoteContext(doc: ProseNode) {
  const cached = contexts.get(doc); if (cached) return cached;
  const result = new Map<string, FootnoteInfo>(); let number = 0;
  const get = (label: string) => { const id = key(label); if (!result.has(id)) result.set(id, { number: 0, text: "", references: [] }); return result.get(id)!; };
  doc.descendants((node, pos) => {
    if (node.type.name === "footnote_definition") { const info = get(node.attrs.identifier); if (info.definition === undefined) { info.definition = pos; info.text = node.textContent; } return false; }
    if (node.type.name === "footnote_reference") { const info = get(node.attrs.identifier); if (!info.number) info.number = ++number; info.references.push(pos); }
  });
  // Footnotes can reference other footnotes. Number these after body references,
  // in definition order of use, just like the shared preview renderer.
  const queue = [...result.values()].filter(info => info.number).sort((a, b) => a.number - b.number);
  for (let index = 0; index < queue.length; index++) {
    const definition = queue[index].definition;
    if (definition === undefined) continue;
    doc.nodeAt(definition)?.descendants((node, offset) => {
      if (node.type.name !== "footnote_reference") return;
      const info = get(node.attrs.identifier);
      if (!info.number) { info.number = ++number; queue.push(info); }
      info.references.push(definition + 1 + offset);
    });
  }
  contexts.set(doc, result); return result;
}
const listeners = new WeakMap<EditorView, Set<() => void>>();
export const footnoteUpdates = $prose(() => new Plugin({ view: () => ({ update(view, previous) { if (view.state.doc !== previous.doc) listeners.get(view)?.forEach(update => update()); } }) }));
export const footnoteNodeView: NodeViewConstructor = (initial, view, getPos) => {
  let node = initial;
  const definition = node.type.name === "footnote_definition";
  const dom = document.createElement(definition ? "section" : "sup"); dom.className = definition ? "footnotes" : "footnote-ref";
  const link = document.createElement("a"); link.contentEditable = "false";
  const contentDOM = definition ? document.createElement("div") : undefined;
  const list = document.createElement("ol"), item = document.createElement("li"), separator = document.createElement("hr");
  list.className = "footnotes-list"; separator.className = "footnotes-sep"; separator.contentEditable = "false";
  link.className = "footnote-backref";
  const backlinks: HTMLAnchorElement[] = [];
  if (contentDOM) { contentDOM.className = "md-footnote-content"; item.className = "footnote-item"; item.append(contentDOM, document.createTextNode(" "), link); list.append(item); dom.append(separator, list); }
  else { dom.contentEditable = "false"; dom.append(link); }
  const update = () => {
    const info = footnoteContext(view.state.doc).get(key(node.attrs.identifier));
    const n = info?.number || 0, occurrence = Math.max(0, info?.references.indexOf(getPos() ?? -1) ?? 0);
    if (definition) {
      dom.dataset.mdFootnoteDefinition = node.attrs.label; item.dataset.footnoteLabel = node.attrs.label;
      separator.hidden = n !== 1;
      list.start = n || 1; item.id = n ? `fn${n}` : `fn-${encodeURIComponent(node.attrs.identifier)}`;
      link.href = `#fnref${n}`; link.textContent = "↩︎"; link.hidden = !n;
      const extra = Math.max(0, (info?.references.length ?? 0) - 1);
      while (backlinks.length > extra) backlinks.pop()!.remove();
      while (backlinks.length < extra) {
        const back = document.createElement("a"), occurrence = backlinks.length + 1;
        back.className = "footnote-backref"; back.contentEditable = "false"; back.dataset.mdFootnoteBack = String(occurrence);
        back.onclick = event => jump(event, occurrence); item.append(back); backlinks.push(back);
      }
      backlinks.forEach((back, index) => { back.href = `#fnref${n}:${index + 1}`; back.textContent = " ↩︎"; back.setAttribute("aria-label", `[${n}:${index + 1}] ↩︎`); });
    } else {
      dom.dataset.mdFootnote = node.attrs.label; dom.title = info?.text || node.attrs.label;
      link.href = `#fn${n}`; link.id = `fnref${n}${occurrence ? `:${occurrence}` : ""}`;
      link.textContent = n ? `[${n}${occurrence ? `:${occurrence}` : ""}]` : `[^${node.attrs.label}]`;
    }
  };
  const jump = (event: MouseEvent, occurrence = 0) => {
    event.preventDefault(); event.stopPropagation();
    const info = footnoteContext(view.state.doc).get(key(node.attrs.identifier));
    const pos = definition ? info?.references[occurrence] : info?.definition;
    if (pos === undefined) return;
    const target = view.nodeDOM(pos); if (target instanceof HTMLElement) target.scrollIntoView({ block: "nearest" });
    if (view.editable) { view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(pos + (definition ? 0 : 1)))).scrollIntoView()); view.focus(); }
  };
  link.onclick = event => jump(event);
  if (!listeners.has(view)) listeners.set(view, new Set()); listeners.get(view)!.add(update); update();
  return { dom, contentDOM, stopEvent: event => link.contains(event.target as Node) || backlinks.some(back => back.contains(event.target as Node)), ignoreMutation: mutation => mutation.type !== "selection" && (!contentDOM || !contentDOM.contains(mutation.target)), update(next) { if (next.type !== node.type) return false; node = next; update(); return true; }, destroy() { listeners.get(view)?.delete(update); } };
};
