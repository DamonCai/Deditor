import { $nodeSchema } from "@milkdown/kit/utils";
import { TextSelection, Selection, type Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { MarkdownDocument } from "./document";

export const inlineProjection = "deditor-inline-projection";
export const inlineSourceSchema = $nodeSchema("deditor_inline_source", () => ({
  attrs: { sourceFrom: { default: 0 } },
  inline: true, group: "inline", content: "text*", marks: "", code: true, isolating: true,
  parseDOM: [],
  toDOM: () => ["span", { "data-md-inline-source": "true", class: "md-inline-source", spellcheck: "false" }, 0],
  parseMarkdown: { match: node => node.type === "deditorInlineSource", runner: (state, node, type) => {
    state.openNode(type); if (node.value) state.addText(String(node.value)); state.closeNode();
  } },
  toMarkdown: { match: node => node.type.name === "deditor_inline_source", runner: (state, node) => { state.addNode("html", undefined, node.textContent); } },
}));

/** A temporary document projection: entering/leaving never edits the source. */
export function installInlineSource(view: EditorView, document: MarkdownDocument, boundary: () => void) {
  let active: { from: number; sourceFrom: number; raw: string; initialRaw: string; original: import("@milkdown/kit/prose/model").Fragment } | null = null;
  let queued = false, destroyed = false, suppressAt = -1;
  const find = () => {
    let found: { node: import("@milkdown/kit/prose/model").Node; pos: number } | null = null;
    view.state.doc.descendants((node, pos) => { if (node.type.name === "deditor_inline_source") { found = { node, pos }; return false; } });
    return found as { node: import("@milkdown/kit/prose/model").Node; pos: number } | null;
  };
  const close = (sourceOffset?: number, sourceAnchor?: number) => {
    if (!active) return;
    const current = find();
    const offset = sourceOffset ?? (current ? active.sourceFrom + Math.max(0, Math.min(current.node.content.size, view.state.selection.head - current.pos - 1)) : active.sourceFrom);
    const previous = active; active = null; boundary();
    const tr = view.state.tr;
    if (current && current.node.textContent === previous.initialRaw) {
      // Caret-only navigation restores this fragment without reparsing the document.
      tr.replaceWith(current.pos, current.pos + current.node.nodeSize, previous.original);
      document.project(tr.doc);
    } else {
      const block = current ? document.reparseInlineBlock(current.pos) : null;
      if (block) {
        tr.replaceWith(block.from, block.to, block.node);
        document.project(tr.doc);
      } else {
        const next = document.reset(document.source);
        tr.replaceWith(0, view.state.doc.content.size, next.content);
      }
    }
    const pos = document.positionAtSource(offset);
    tr.setSelection(sourceAnchor === undefined ? Selection.near(tr.doc.resolve(pos)) : TextSelection.between(tr.doc.resolve(document.positionAtSource(sourceAnchor)), tr.doc.resolve(pos)));
    suppressAt = tr.selection.head;
    view.dispatch(tr.setMeta(inlineProjection, true));
  };
  const update = () => {
    if (queued || destroyed) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (destroyed || view.composing) return;
      const selection = view.state.selection;
      if (active) {
        const current = find();
        if (!current) { active = null; return; }
        if (!view.editable || !view.hasFocus()) { close(); return; }
        if (selection.from < current.pos + 1 || selection.to > current.pos + current.node.nodeSize - 1) close(document.sourceOffset(selection.head), document.sourceOffset(selection.anchor));
        return;
      }
      if (!view.editable || !view.hasFocus() || !selection.empty || !(selection instanceof TextSelection)) return;
      if (selection.head === suppressAt) return;
      suppressAt = -1;
      const token = document.inlineAt(selection.head);
      if (!token) return;
      const offset = Math.min(token.raw.length, Math.max(0, document.sourceOffset(selection.head) - token.sourceFrom));
      const node = view.state.schema.nodes.deditor_inline_source.create({ sourceFrom: token.sourceFrom }, view.state.schema.text(token.raw));
      active = { from: token.from, sourceFrom: token.sourceFrom, raw: token.raw, initialRaw: token.raw, original: view.state.doc.slice(token.from, token.to).content }; boundary();
      const tr = view.state.tr.replaceWith(token.from, token.to, node);
      tr.setSelection(TextSelection.create(tr.doc, token.from + 1 + offset));
      view.dispatch(tr.setMeta(inlineProjection, true));
    });
  };
  const key = (event: KeyboardEvent) => {
    if (!active || event.isComposing || view.composing) return;
    const current = find(); if (!current) return;
    const at = view.state.selection.head - current.pos - 1;
    if (event.key === "Escape" || event.key === "Enter" || event.key === "Tab" ||
      event.key === "ArrowLeft" && at === 0 || event.key === "ArrowRight" && at === current.node.content.size) {
      const offset = active.sourceFrom + (event.key === "ArrowRight" ? current.node.content.size : at);
      close(offset);
      if (event.key !== "Enter" && event.key !== "Tab") { event.preventDefault(); event.stopPropagation(); }
    }
  };
  const paste = (event: ClipboardEvent) => {
    if (!active || !view.editable || view.composing) return;
    const text = event.clipboardData?.getData("text/plain");
    if (text == null || text === "" && event.clipboardData?.getData("text/html")) { close(); return; }
    event.preventDefault(); event.stopPropagation();
    view.dispatch(view.state.tr.insertText(text));
    if (/[\r\n]/.test(text)) close();
  };
  const blur = () => update();
  const click = () => { if (!active) suppressAt = -1; update(); };
  view.dom.addEventListener("paste", paste, true);
  view.dom.addEventListener("keydown", key, true);
  view.dom.addEventListener("focusin", update);
  view.dom.addEventListener("focusout", blur);
  view.dom.addEventListener("click", click);
  view.dom.addEventListener("compositionend", update);
  return {
    update, close, reset() { active = null; suppressAt = -1; },
    apply(tr: Transaction) {
      if (tr.getMeta(inlineProjection)) { document.project(view.state.doc); return true; }
      if (!active) return false;
      const current = find();
      if (!current) { active = null; return false; }
      const old = document.doc.nodeAt(active.from);
      if (!old || old.type.name !== "deditor_inline_source") return false;
      // Direct source edits preserve surrounding punctuation and token spelling.
      const restored = view.state.tr.replaceWith(current.pos, current.pos + current.node.nodeSize, old).doc;
      if (!restored.eq(document.doc)) return false;
      document.editInline(active.sourceFrom, active.raw.length, current.node.textContent, view.state.doc);
      active.from = current.pos; active.raw = current.node.textContent;
      return true;
    },
    destroy() {
      destroyed = true; active = null;
      view.dom.removeEventListener("paste", paste, true);
      view.dom.removeEventListener("keydown", key, true);
      view.dom.removeEventListener("focusin", update);
      view.dom.removeEventListener("focusout", blur);
      view.dom.removeEventListener("click", click);
      view.dom.removeEventListener("compositionend", update);
    },
  };
}
