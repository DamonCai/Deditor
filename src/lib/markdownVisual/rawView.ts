import { useEditorStore } from "../../store/editor";
import { sourceTree, range } from "./document";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { EditorView as ProseView, NodeView } from "@milkdown/kit/prose/view";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState, Prec } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import DOMPurify from "dompurify";
import { renderMarkdown } from "../markdown";
import { hydrateLocalImages } from "../localImgHydrate";
import { tStatic } from "../i18n";
import { markdownHistory } from "../markdownHistory";
import { logError } from "../logger";

export function rawView(filePath: string | null, tabId: string) {
  return (initial: ProseNode, view: ProseView, getPos: () => number | undefined): NodeView => {
    let node = initial, cm: EditorView | null = null, updating = false, generation = 0, destroyed = false;
    const dom = document.createElement("section"); dom.className = "md-raw-block";
    const preview = document.createElement("div"); preview.className = "markdown-body md-raw-preview";
    const button = document.createElement("button"); button.className = "deditor-btn md-raw-edit"; button.dataset.variant = "ghost";
    button.type = "button"; button.textContent = tStatic("md.editSourceBlock");
    const editor = document.createElement("div"); editor.className = "md-raw-source";
    dom.append(preview, button, editor);
    const render = () => {
      const version = ++generation;
      button.hidden = !view.editable;
      const source = useEditorStore.getState().tabs.find(t => t.id === tabId)?.content ?? "";
      const definitions = sourceTree(source).children?.filter(n => n.type === "definition").map(n => source.slice(...range(n))).join("\n") ?? "";
      void renderMarkdown(node.textContent + "\n\n" + definitions, { theme: document.documentElement.classList.contains("dark") ? "dark" : "light" }).then(html => {
        if (destroyed || version !== generation) return;
        preview.innerHTML = DOMPurify.sanitize(html);
        hydrateLocalImages(preview, filePath);
      }).catch(error => { logError("Markdown preserved block render failed", error); preview.textContent = node.textContent; });
    };
    const close = () => { cm?.destroy(); cm = null; editor.replaceChildren(); button.textContent = tStatic("md.editSourceBlock"); render(); return true; };
    button.onclick = () => {
      if (!view.editable) return;
      if (cm) { close(); return; }
      button.textContent = tStatic("common.confirm");
      cm = new EditorView({ parent: editor, state: EditorState.create({ doc: node.textContent, extensions: [
        basicSetup, markdown(), EditorView.lineWrapping,
        Prec.highest(keymap.of([{ key: "Escape", run: close }, { key: "Mod-z", run: () => markdownHistory(false, tabId) }, { key: "Mod-Shift-z", run: () => markdownHistory(true, tabId) }])),
        EditorView.updateListener.of(update => {
          if (!update.docChanged || updating) return;
          const pos = getPos(); if (pos === undefined) return;
          const text = update.state.doc.toString();
          const tr = view.state.tr.replaceWith(pos + 1, pos + 1 + node.content.size, text ? view.state.schema.text(text) : []);
          view.dispatch(tr);
        }),
      ] }) }); cm.focus();
    };
    preview.addEventListener("click", e => { if ((e.target as HTMLElement).closest("a")) e.preventDefault(); });
    const modeChanged = () => { if (!view.editable) close(); render(); };
    view.dom.addEventListener("deditor-editable-change", modeChanged);
    render();
    return { dom, stopEvent: event => editor.contains(event.target as Node) || event.target === button,
      ignoreMutation: () => true,
      update(next) {
        if (next.type !== node.type) return false;
        node = next;
        if (cm && cm.state.doc.toString() !== next.textContent) {
          updating = true; cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: next.textContent } }); updating = false;
        }
        render(); return true;
      }, destroy() { view.dom.removeEventListener("deditor-editable-change", modeChanged); destroyed = true; generation++; cm?.destroy(); },
    };
  };
}
