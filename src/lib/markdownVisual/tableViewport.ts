import { $prose } from "@milkdown/kit/utils";
import { NodeSelection, TextSelection, Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView, type NodeViewConstructor } from "@milkdown/kit/prose/view";
import { DOMSerializer, type Node as ProseNode } from "@milkdown/kit/prose/model";
import { useEditorStore } from "../../store/editor";

interface WindowState { shown: Set<ProseNode>; tables: { node: ProseNode; pos: number }[]; nodes: Set<ProseNode>; eager: Set<ProseNode>; decorations: DecorationSet }
const key = new PluginKey<WindowState>("deditor-table-viewport");
const textNodes = new Set(["table_row", "table_header_row", "table_cell", "table_header", "paragraph", "text", "math_inline"]);
const blockNames = ["paragraph", "heading", "bullet_list", "ordered_list", "blockquote"];
const plainNodes = new Set(["paragraph", "bullet_list", "ordered_list", "blockquote", "list_item", "text", "hardbreak", "math_inline"]);
const textMarks = new Set(["strong", "emphasis", "inlineCode", "strike_through", "link", "deditor_mark", "deditor_superscript", "deditor_subscript"]);
function eligible(node: ProseNode) {
  let plain = true;
  node.descendants(child => {
    if (!textNodes.has(child.type.name) || !localMath(child) || child.marks.some(mark => !textMarks.has(mark.type.name))) plain = false;
    return plain;
  });
  return plain;
}
function localMath(node: ProseNode) {
  // Equation anchors/references retain their original DOM and link behavior.
  return node.type.name !== "math_inline" || !/\\(?:label|eqref|ref)\b/.test(String(node.attrs.value));
}
function plainBlock(node: ProseNode) {
  let plain = true;
  node.descendants(child => {
    if (!plainNodes.has(child.type.name) || !localMath(child) || child.marks.some(mark => !textMarks.has(mark.type.name))) plain = false;
    return plain;
  });
  return plain;
}
function initialShown(blocks: WindowState["tables"]) {
  let tables = 0, text = 0;
  return new Set(blocks.filter(({node}) => node.type.name === "table" ? ++tables <= 1 : ++text <= 8).map(({node}) => node));
}
function collect(doc: ProseNode) {
  const tables: WindowState["tables"] = [];
  // Only root blocks are deferred. Nested views keep their original factory;
  // one root anchor compensates each measured replacement together.
  doc.forEach((node, pos) => { if (node.type.name === "table" || blockNames.includes(node.type.name)) tables.push({ node, pos }); });
  return tables;
}
function stateFor(doc: ProseNode, tables: WindowState["tables"], shown: Set<ProseNode>, previous?: WindowState): WindowState {
  return { shown, tables, nodes: previous?.tables === tables ? previous.nodes : new Set(tables.map(item => item.node)),
    eager: previous?.tables === tables ? previous.eager : initialShown(tables), decorations: DecorationSet.create(doc, tables.filter(item => shown.has(item.node))
    .map(item => Decoration.node(item.pos, item.pos + item.node.nodeSize, { "data-deditor-block-ready": "true" }))) };
}

/** Keep the complete ProseMirror model. Plain offscreen prose and tables need
 * no nested controls or text DOM until they approach the viewport. Once created
 * they stay live; no active edit, selection or embedded media is recycled. */
export function tableViewport(enabled: boolean) {
  let textMetrics: {width:number; font:number} | undefined;
  const pending = new Map<HTMLElement, () => number | undefined>();
  const pendingCode = new Map<HTMLElement, () => void>();
  const codeJobs = new Map<HTMLElement, () => void>();
  let codeVisits = 0;
  let queueCode: ((element: HTMLElement) => void) | undefined;
  let observer: IntersectionObserver | undefined;
  let reveal: ((positions: number[]) => void) | undefined;
  const plugin = $prose(() => new Plugin<WindowState>({
    key,
    state: {
      init: (_, state) => {
        const tables = collect(state.doc);
        return stateFor(state.doc, tables, initialShown(tables));
      },
      apply(tr, previous) {
        if (!enabled) return previous;
        const tables = tr.docChanged ? collect(tr.doc) : previous.tables;
        const positions = new Set(tr.getMeta(key) as number[] | undefined);
        const selected = tr.selection.$head;
        const eager = tr.docChanged ? initialShown(tables) : previous.eager;
        const styled = !!useEditorStore.getState().markdownSettings.customCss.trim();
        const shown = new Set<ProseNode>();
        let changed = tr.docChanged;
        for (let i = 0; i < tables.length; i++) {
          const { node, pos } = tables[i];
          if (styled || eager.has(node) || previous.shown.has(node) || positions.has(pos)
            || selected.pos > pos && selected.pos < pos + node.nodeSize
            || tr.selection instanceof NodeSelection && tr.selection.node === node) shown.add(node);
          if (shown.has(node) !== previous.shown.has(node)) changed = true;
        }
        return changed ? stateFor(tr.doc, tables, shown, previous) : previous;
      },
    },
    props: { decorations: state => enabled ? key.getState(state)?.decorations : undefined },
    view(view) {
      if (!enabled) return {};
      const scroll = view.dom.closest<HTMLElement>(".md-visual-scroll");
      const owner = view.dom.ownerDocument, win = owner.defaultView!;
      const queued = new Set<ProseNode>();
      let frame = 0, codeFrame = 0, warmFrame = 0, disposed = false;
      const runCode = () => {
        codeFrame = 0;
        if (disposed || view.isDestroyed || view.composing) return;
        const start = performance.now();
        for (const [element, render] of codeJobs) {
          codeJobs.delete(element); render();
          if (performance.now() - start >= 4) break;
        }
        if (codeJobs.size) codeFrame = win.requestAnimationFrame(runCode);
      };
      queueCode = element => {
        const render = pendingCode.get(element);
        if (!render) return;
        pendingCode.delete(element); observer?.unobserve(element);
        codeJobs.set(element, render);
        if (!codeFrame && !disposed) codeFrame = win.requestAnimationFrame(runCode);
      };
      const flush = () => {
        frame = 0;
        if (disposed || view.isDestroyed || view.composing || !queued.size) return;
        const positions = key.getState(view.state)?.tables.filter(item => queued.has(item.node)).map(item => item.pos) ?? [];
        queued.clear();
        // Preserve the visible block when an estimate above it becomes exact.
        // The replacement and compensation happen together before painting.
        let anchor: HTMLElement | null = null, at = 0, top = 0;
        if (scroll && typeof owner.elementFromPoint === "function") {
          const rect = scroll.getBoundingClientRect();
          let element = owner.elementFromPoint(rect.left + Math.min(80, rect.width / 2), rect.top + 16) as HTMLElement | null;
          while (element?.parentElement && element.parentElement !== view.dom) element = element.parentElement;
          if (element?.parentElement === view.dom) {
            anchor = element; top = anchor.getBoundingClientRect().top;
            try { at = view.posAtDOM(view.dom, Array.prototype.indexOf.call(view.dom.childNodes, anchor)); }
            catch { anchor = null; }
          }
        }
        view.dispatch(view.state.tr.setMeta(key, positions).setMeta("addToHistory", false));
        if (anchor && scroll) {
          const next = anchor.isConnected ? anchor : view.nodeDOM(at);
          if (next?.nodeType === 1) {
            const delta = (next as HTMLElement).getBoundingClientRect().top - top;
            if (Math.abs(delta) > .5) scroll.scrollTop += delta;
          }
        }
      };
      reveal = positions => {
        positions.forEach(pos => { const node = view.state.doc.nodeAt(pos); if (node && (node.type.name === "table" || blockNames.includes(node.type.name))) queued.add(node); });
        if (!frame && !disposed) frame = win.requestAnimationFrame(flush);
      };
      const resume = () => {
        if (queued.size) reveal?.([]);
        if (codeJobs.size && !codeFrame) codeFrame = win.requestAnimationFrame(runCode);
      };
      const settingsChanged = () => {
        if (useEditorStore.getState().markdownSettings.customCss.trim()) {
          reveal?.(key.getState(view.state)?.tables.map(item => item.pos) ?? []);
          for (const element of pendingCode.keys()) queueCode?.(element);
        }
      };
      view.dom.addEventListener("compositionend", resume);
      view.dom.addEventListener("deditor-writing-change", settingsChanged);
      if (scroll && typeof win.IntersectionObserver === "function") {
        const watch = (rootMargin: string) => {
        observer?.disconnect();
        observer = new win.IntersectionObserver(entries => {
          for (const entry of entries) if (entry.isIntersecting) queueCode?.(entry.target as HTMLElement);
          const positions = entries.filter(entry => entry.isIntersecting).flatMap(entry => {
            try { const pos = pending.get(entry.target as HTMLElement)?.(); return pos === undefined ? [] : [pos]; }
            catch { return []; }
          });
          if (positions.length) reveal?.(positions);
        }, { root: scroll, rootMargin });
        for (const element of pending.keys()) observer.observe(element);
        for (const element of pendingCode.keys()) observer.observe(element);
        };
        // Initial work follows the visible viewport. Expand the scroll buffer
        // after the first frame, so offscreen prefetch cannot hold up opening.
        watch("0px");
        warmFrame = win.requestAnimationFrame(() => {
          warmFrame = win.requestAnimationFrame(() => {
            warmFrame = 0;
            if (!disposed && !view.isDestroyed) watch("1200px 0px");
          });
        });
      } else {
        reveal([...pending.values()].flatMap(getPos => { const pos = getPos(); return pos === undefined ? [] : [pos]; }));
        for (const element of pendingCode.keys()) queueCode(element);
      }
      return { destroy() {
        disposed = true; win.cancelAnimationFrame(frame); win.cancelAnimationFrame(codeFrame); win.cancelAnimationFrame(warmFrame); observer?.disconnect(); observer = undefined;
        reveal = undefined; queued.clear(); pending.clear(); view.dom.removeEventListener("compositionend", resume);
        queueCode = undefined; pendingCode.clear(); codeJobs.clear();
        view.dom.removeEventListener("deditor-writing-change", settingsChanged);
      } };
    },
  }));
  const wrap = (create: NodeViewConstructor): NodeViewConstructor => (node, view, getPos, outer, inner) => {
    const state = key.getState(view.state);
    if (!enabled || !state?.nodes.has(node) || state.shown.has(node) || !(node.type.name === "table" ? eligible(node) : plainBlock(node))) {
      return create(node, view, getPos, outer, inner);
    }
    const owner = view.dom.ownerDocument;
    // Preserve the schema root and its margins/attributes; only its plain
    // descendants are absent. Images, HTML, math and unknown nodes stay eager.
    const dom = node.type.name === "table" ? owner.createElement("div")
      : DOMSerializer.renderSpec(owner, node.type.spec.toDOM!(node)).dom as HTMLElement;
    if (node.type.name === "table") {
      dom.className = "milkdown-table-block";
      dom.dataset.deditorTablePending = "true";
      dom.style.height = `${node.childCount * 32 + 28}px`;
    } else {
      dom.dataset.deditorTextPending = "true";
      textMetrics ??= { width: Math.max(160, view.dom.parentElement?.clientWidth || 800),
        font: parseFloat(owner.defaultView!.getComputedStyle(view.dom).fontSize) || 14 };
      const {width, font} = textMetrics;
      const columns = Math.max(12, width / font - 8), line = font * 1.8;
      const height = (block: ProseNode): number => {
        if (block.type.name === "paragraph" || block.type.name === "heading") {
          let units = 0, breaks = 0;
          block.descendants(child => {
            if (child.isText || child.type.name === "math_inline") {
              for (const char of child.isText ? child.text! : String(child.attrs.value)) units += char.charCodeAt(0) < 128 ? .6 : 1;
            }
            else if (child.type.name === "hardbreak") breaks++;
          });
          const level = block.type.name === "heading" ? Number(block.attrs.level) : 0;
          const scale = [1, 2, 1.45, 1.25, 1.1, 1, .95][level] ?? 1;
          return (Math.max(1, Math.ceil(units / (columns / scale))) + breaks) * (level ? font * scale * 1.45 : line)
            + (level === 2 ? font * scale * .45 + 1 : 0);
        }
        let total = 0; block.forEach(child => { total += height(child) + 8; });
        return Math.max(line, total);
      };
      dom.style.height = `${height(node)}px`;
    }
    dom.contentEditable = "false";
    dom.onmousedown = event => {
      if (event.button !== 0 || !view.editable) return;
      event.preventDefault(); event.stopPropagation();
      const pos = getPos(); if (pos === undefined) return;
      view.dispatch(view.state.tr.setMeta(key, [pos]).setMeta("addToHistory", false));
      const hit = view.posAtCoords({left:event.clientX, top:event.clientY});
      if (hit) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(hit.pos))));
      view.focus();
    };
    pending.set(dom, getPos);
    observer?.observe(dom);
    let current = node;
    return {
      dom,
      update(next) {
        if (next !== current || key.getState(view.state)?.shown.has(next)) return false;
        current = next;
        return true;
      },
      ignoreMutation: mutation => mutation.type !== "selection",
      destroy() { observer?.unobserve(dom); pending.delete(dom); },
    };
  };
  const defer = enabled ? (element: HTMLElement, render: () => void) => {
    // Keep initial visible code eager; later blocks have complete inert text
    // and receive token spans before they approach the viewport.
    if (++codeVisits <= 2) return;
    pendingCode.set(element, render); observer?.observe(element);
    return () => { pendingCode.delete(element); codeJobs.delete(element); observer?.unobserve(element); };
  } : undefined;
  const textViews = (originals: Record<string, NodeViewConstructor>) => !enabled ? {} : Object.fromEntries(blockNames.map(name => [name, wrap(originals[name] ?? ((node, view) =>
    DOMSerializer.renderSpec(view.dom.ownerDocument, node.type.spec.toDOM!(node))))]));
  const materialize = (view: EditorView, pos: number) => {
    if (enabled) view.dispatch(view.state.tr.setMeta(key, [pos]).setMeta("addToHistory", false));
  };
  return { plugin, wrap, defer, textViews, materialize };
}
