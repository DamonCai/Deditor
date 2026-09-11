import { hydrateMermaid } from "../mermaidHydrate";
import { hydratePlantuml } from "../plantumlHydrate";
import { useEditorStore } from "../../store/editor";
import { sourceTree, range } from "./document";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { EditorView as ProseView, NodeView } from "@milkdown/kit/prose/view";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState, Prec } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import DOMPurify from "dompurify";
import { renderMarkdownFragment } from "../markdownFragments";
import { hydrateLocalImages } from "../localImgHydrate";
import { tStatic } from "../i18n";
import { markdownHistory } from "../markdownHistory";
import { logError } from "../logger";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";

export function rawView(filePath: string | null, tabId: string) {
  return (initial: ProseNode, view: ProseView, getPos: () => number | undefined): NodeView => {
    let node = initial, cm: EditorView | null = null, updating = false, generation = 0, destroyed = false;
    let controllers: AbortController[] = [];
    const dom = document.createElement("section"); dom.className = "md-raw-block"; dom.contentEditable = "false";
    const preview = document.createElement("div"); preview.className = "markdown-body md-raw-preview";
    const button = document.createElement("button"); button.className = "deditor-btn md-raw-edit"; button.dataset.variant = "ghost";
    button.type = "button"; button.textContent = tStatic("md.editSourceBlock");
    const editor = document.createElement("div"); editor.className = "md-raw-source";
    dom.append(preview, button, editor);
    const render = () => {
      const version = ++generation;
      controllers.forEach(controller => controller.abort()); controllers = [];
      button.hidden = !view.editable;
      preview.hidden = !!cm;
      preview.title = view.editable ? tStatic("md.editSourceBlock") : "";
      if (cm) return;
      const source = useEditorStore.getState().tabs.find(t => t.id === tabId)?.content ?? "";
      const ast = sourceTree(source).children ?? [];
      const definitions = ast.filter(n => n.type === "definition").map(n => source.slice(...range(n))).join("\n");
      let index = 0; view.state.doc.forEach((_node, offset, i) => { if (offset === getPos()) index = i; });
      const start = ast[index] ? range(ast[index])[0] : 0;
      const line = source.slice(0, start).split("\n").length;
      void renderMarkdownFragment(node.textContent + "\n\n" + definitions, source, line, { theme: document.documentElement.classList.contains("dark") ? "dark" : "light" }).then(html => {
        if (destroyed || version !== generation) return;
        // Read inert source text before sanitizing: arrows in diagram attributes
        // are rejected by DOMPurify. Restore only renderer metadata, never HTML.
        const template = document.createElement("template"); template.innerHTML = html;
        preview.innerHTML = DOMPurify.sanitize(html);
        for (const kind of ["mermaid", "plantuml"]) {
          const originals = template.content.querySelectorAll(`.${kind}-diagram`);
          preview.querySelectorAll(`.${kind}-diagram`).forEach((element, index) => {
            for (const suffix of ["source", "encoded"]) {
              const name = `data-${kind}-${suffix}`, value = originals[index]?.getAttribute(name);
              if (value !== null && value !== undefined) element.setAttribute(name, value);
            }
          });
        }
        hydrateLocalImages(preview, filePath);
        controllers = [hydrateMermaid(preview, document.documentElement.classList.contains("dark") ? "dark" : "light"), hydratePlantuml(preview)];
      }).catch(error => { logError("Markdown preserved block render failed", error); if (!destroyed && version === generation) preview.textContent = node.textContent; });
    };
    const close = (focus = true) => {
      cm?.destroy(); cm = null; editor.replaceChildren(); dom.style.minHeight = ""; button.textContent = tStatic("md.editSourceBlock"); render();
      const pos = getPos();
      if (focus && pos !== undefined) { view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos))); view.focus(); }
      return true;
    };
    const open = (anchor = 0, head = anchor) => {
      if (!view.editable) return;
      if (cm) return;
      dom.style.minHeight = `${dom.getBoundingClientRect().height}px`;
      generation++; controllers.forEach(controller => controller.abort()); controllers = []; preview.hidden = true;
      button.textContent = tStatic("common.confirm");
      cm = new EditorView({ parent: editor, state: EditorState.create({ doc: node.textContent, selection: { anchor, head }, extensions: [
        basicSetup, markdown(), EditorView.lineWrapping,
        Prec.highest(keymap.of([{ key: "Escape", run: () => close() }, { key: "Mod-z", run: () => markdownHistory(false, tabId) }, { key: "Mod-Shift-z", run: () => markdownHistory(true, tabId) }])),
        EditorView.updateListener.of(update => {
          if (updating || !(update.docChanged || update.view.hasFocus && (update.selectionSet || update.focusChanged))) return;
          const pos = getPos(); if (pos === undefined) return;
          const text = update.state.doc.toString();
          const tr = view.state.tr;
          if (update.docChanged) tr.replaceWith(pos + 1, pos + 1 + node.content.size, text ? view.state.schema.text(text) : []);
          const selection = update.state.selection.main;
          tr.setSelection(TextSelection.create(tr.doc, pos + 1 + selection.anchor, pos + 1 + selection.head));
          view.dispatch(tr);
        }),
      ] }) }); cm.focus();
    };
    button.onclick = () => { if (view.editable) { if (cm) close(); else open(); } };
    preview.addEventListener("click", e => {
      const link = (e.target as HTMLElement).closest("a");
      if (link) {
        e.preventDefault();
        const href = link.getAttribute("href") ?? "";
        if (href.startsWith("#")) {
          let id = href.slice(1); try { id = decodeURIComponent(id); } catch { /* Keep malformed fragments inert. */ }
          Array.from(view.dom.querySelectorAll<HTMLElement>("[id]")).find(element => element.id === id || element.id === href.slice(1))?.scrollIntoView({ block: "nearest" });
          return;
        }
      }
      if (view.editable && !(e.target as HTMLElement).closest("summary,button,input")) open();
    });
    const modeChanged = () => { if (!view.editable) close(false); render(); };
    view.dom.addEventListener("deditor-editable-change", modeChanged);
    // Context changes can renumber a footnote or rename a TOC heading without changing this node.
    let refreshQueued = false;
    const unsubscribe = useEditorStore.subscribe((state, previous) => {
      if (state.tabs.find(t => t.id === tabId)?.content === previous.tabs.find(t => t.id === tabId)?.content || !/\[\^|^\s*\[(?:toc|\[toc\])\]/im.test(node.textContent) || refreshQueued) return;
      refreshQueued = true;
      queueMicrotask(() => { refreshQueued = false; if (!destroyed) render(); });
    });
    render();
    return { dom, stopEvent: () => true,
      ignoreMutation: () => true,
      setSelection(anchor, head) {
        if (!view.editable) return;
        open(anchor, head);
        if (cm) { updating = true; cm.dispatch({ selection: { anchor, head } }); updating = false; cm.focus(); }
      },
      update(next) {
        if (next.type !== node.type) return false;
        const changed = node.textContent !== next.textContent;
        node = next;
        if (cm && cm.state.doc.toString() !== next.textContent) {
          updating = true; cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: next.textContent } }); updating = false;
        }
        if (changed) render(); return true;
      }, destroy() { controllers.forEach(controller => controller.abort()); unsubscribe(); view.dom.removeEventListener("deditor-editable-change", modeChanged); destroyed = true; generation++; cm?.destroy(); },
    };
  };
}
