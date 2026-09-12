import { $nodeSchema } from "@milkdown/kit/utils";
import { TextSelection, Selection, type Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { sourceTree, type MarkdownDocument, type SourceNode } from "./document";

function inlineBody(raw: string) {
  const node = sourceTree(raw).children?.[0]?.children?.[0];
  if (!node || node.position?.start.offset !== 0 || node.position?.end.offset !== raw.length) return null;
  if (node.type === "inlineCode") {
    const fence = raw.match(/^`+/)?.[0];
    if (!fence || !node.value) return null;
    const at = raw.indexOf(node.value, fence.length);
    return { from: at < 0 ? fence.length : at, to: at < 0 ? raw.length - fence.length : at + node.value.length };
  }
  if (!["strong", "emphasis", "delete", "mark", "subscript", "superscript", "link"].includes(node.type)) return null;
  const leaves: SourceNode[] = [];
  const walk = (node: SourceNode) => { if (node.type === "text") leaves.push(node); else node.children?.forEach(walk); };
  walk(node);
  const from = leaves[0]?.position?.start.offset, to = leaves.at(-1)?.position?.end.offset;
  return from === undefined || to === undefined || from === to ? null : { from, to };
}

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
  let active: { from: number; sourceFrom: number; raw: string; initialRaw: string; emptyRaw: string | null; original: import("@milkdown/kit/prose/model").Fragment } | null = null;
  let queued = false, destroyed = false, suppressAt = -1;
  let enteringAfterInput = false;
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
    const selection = view.state.selection;
    const tr = view.state.tr;
    const restoreFragment = current && current.node.textContent === previous.initialRaw;
    if (restoreFragment) {
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
    const changedFrom = view.state.doc.content.findDiffStart(tr.doc.content);
    const changedEnd = view.state.doc.content.findDiffEnd(tr.doc.content);
    const mapEndpoint = (pos: number, source: number) => {
      // Navigation already supplied an exact document position. Preserve it
      // through the local replacement instead of round-tripping via Markdown.
      if (changedFrom === null || pos <= changedFrom) return pos;
      if (changedEnd && pos >= changedEnd.a) return pos + changedEnd.b - changedEnd.a;
      return document.positionAtSource(source);
    };
    const pos = mapEndpoint(selection.head, offset);
    tr.setSelection(sourceAnchor === undefined ? Selection.near(tr.doc.resolve(pos)) : TextSelection.between(tr.doc.resolve(mapEndpoint(selection.anchor, sourceAnchor)), tr.doc.resolve(pos)));
    // Closing source while the caret is inside its delimiters must retain
    // non-inclusive marks (notably inline code). Otherwise a toolbar click at
    // the text end enables that mark again instead of switching it off.
    if (current && selection.empty && selection.head > current.pos + 1 && selection.head < current.pos + 1 + current.node.content.size) {
      const at = tr.selection.$head;
      const body = inlineBody(current.node.textContent), offset = selection.head - current.pos - 1;
      const marks = body && offset === body.from ? at.nodeAfter?.marks
        : body && offset === body.to ? at.nodeBefore?.marks
        : at.marks().length ? at.marks() : at.nodeBefore?.marks ?? at.nodeAfter?.marks;
      if (marks?.length) tr.setStoredMarks(marks);
    } else if (current && selection.empty && selection.$head.parent.type.name === "deditor_inline_source") {
      // Moving beyond the delimiters leaves their formatting as well. At a
      // rendered boundary, inclusive marks otherwise leak into outside text.
      const at = tr.selection.$head;
      tr.setStoredMarks(selection.head <= current.pos + 1 ? at.nodeBefore?.marks ?? [] : at.nodeAfter?.marks ?? []);
    }
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
      if (enteringAfterInput && selection.head === token.from) {
        // Typing immediately before a formatted word stays outside it. Opening
        // its source here would move the next character past the opening mark.
        enteringAfterInput = false;
        return;
      }
      const body = inlineBody(token.raw);
      const enteredByInput = enteringAfterInput;
      // A newly typed character ends inside its marks, even though the source
      // offset at that rendered boundary also covers the closing delimiters.
      const offset = enteringAfterInput && body && selection.head === token.to
        ? body.to : Math.min(token.raw.length, Math.max(0, document.sourceOffset(selection.head) - token.sourceFrom));
      enteringAfterInput = false;
      const node = view.state.schema.nodes.deditor_inline_source.create({ sourceFrom: token.sourceFrom }, view.state.schema.text(token.raw));
      active = { from: token.from, sourceFrom: token.sourceFrom, raw: token.raw, initialRaw: token.raw, emptyRaw: body ? token.raw.slice(0, body.from) + token.raw.slice(body.to) : null, original: view.state.doc.slice(token.from, token.to).content };
      if (!enteredByInput) boundary();
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
    get active() { return !!active; },
    update, close, reset() { active = null; suppressAt = -1; enteringAfterInput = false; },
    apply(tr: Transaction) {
      if (tr.getMeta(inlineProjection)) { document.project(view.state.doc); return true; }
      if (!active) { enteringAfterInput = tr.docChanged && tr.selection.empty; return false; }
      let current = find();
      if (!current) { active = null; return false; }
      const old = document.doc.nodeAt(active.from);
      if (!old || old.type.name !== "deditor_inline_source") return false;
      if (tr.docChanged && active.emptyRaw !== null && current.node.textContent === active.emptyRaw && current.node.textContent !== active.raw) {
        // Deleting the last formatted text should delete its empty shell in
        // the same user transaction, rather than leave visible **** or ``.
        const empty = view.state.tr.delete(current.pos + 1, current.pos + 1 + current.node.content.size).setStoredMarks([]);
        view.updateState(view.state.apply(empty.setMeta("addToHistory", false)));
        current = find()!;
      }
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
