import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { EditorView as ProseView, NodeView } from "@milkdown/kit/prose/view";
import { TextSelection } from "@milkdown/kit/prose/state";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState, Prec, Compartment } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { languages } from "@codemirror/language-data";
import { LanguageDescription } from "@codemirror/language";
import DOMPurify from "dompurify";
import { renderMarkdown } from "../markdown";
import { hydrateMermaid } from "../mermaidHydrate";
import { hydratePlantuml } from "../plantumlHydrate";
import { islandLight } from "../islandLightTheme";
import { islandDark } from "../islandDarkTheme";
import { tStatic } from "../i18n";
import { markdownHistory } from "../markdownHistory";
import { logError } from "../logger";

export function codeView(tabId: string, theme: "light" | "dark") {
  return (initial: ProseNode, view: ProseView, getPos: () => number | undefined): NodeView => {
    let node = initial, updating = false, generation = 0, languageGeneration = 0, destroyed = false, expanded = false;
    let controllers: AbortController[] = [];
    const dom = document.createElement("section"); dom.className = "md-code-block"; dom.contentEditable = "false";
    const bar = document.createElement("div"); bar.className = "md-code-bar";
    const language = document.createElement("input"); language.className = "deditor-input deditor-input--compact";
    language.setAttribute("aria-label", tStatic("md.codeLanguage")); language.value = node.attrs.language ?? "";
    const toggle = document.createElement("button"); toggle.className = "deditor-btn md-code-toggle"; toggle.dataset.variant = "ghost";
    const copy = document.createElement("button"); copy.className = "deditor-btn"; copy.dataset.variant = "ghost"; copy.textContent = tStatic("editor.copy");
    copy.onclick = () => { void navigator.clipboard.writeText(node.textContent).catch(err => logError("Markdown code copy failed", err)); };
    bar.append(language, toggle, copy);
    const editor = document.createElement("div"), preview = document.createElement("div"); preview.className = "markdown-body md-code-preview";
    dom.append(bar, editor, preview);
    const languageCompartment = new Compartment(), editableCompartment = new Compartment();
    const cm = new EditorView({ parent: editor, state: EditorState.create({ doc: node.textContent, extensions: [basicSetup, EditorView.lineWrapping,
      theme === "dark" ? islandDark : islandLight, languageCompartment.of([]), editableCompartment.of(EditorView.editable.of(view.editable)),
      Prec.highest(keymap.of([
        { key: "Mod-z", run: () => markdownHistory(false, tabId) }, { key: "Mod-Shift-z", run: () => markdownHistory(true, tabId) },
        { key: "Escape", run: () => { expanded = false; render(); view.focus(); return true; } },
        { key: "ArrowDown", run: () => {
          if (!view.editable) return false;
          if (cm.state.selection.main.head !== cm.state.doc.length) return false;
          const pos = getPos(); if (pos === undefined) return false;
          const after = pos + node.nodeSize, tr = view.state.tr;
          if (after === tr.doc.content.size) tr.insert(after, view.state.schema.nodes.paragraph.create());
          tr.setSelection(TextSelection.create(tr.doc, after + 1)); view.dispatch(tr.scrollIntoView()); view.focus(); return true;
        } },
      ])),
      EditorView.updateListener.of(update => {
        if (updating) return;
        const pos = getPos(); if (pos === undefined) return;
        if (update.docChanged) {
          const tr = view.state.tr; let offset = pos + 1;
          update.changes.iterChanges((fromA, toA, fromB, toB, text) => {
            tr.replaceWith(offset + fromA, offset + toA, text.length ? view.state.schema.text(text.toString()) : []); offset += (toB - fromB) - (toA - fromA);
          });
          tr.setSelection(TextSelection.create(tr.doc, pos + 1 + update.state.selection.main.anchor, pos + 1 + update.state.selection.main.head));
          view.dispatch(tr);
        }
      }),
    ] }) });
    const loadLanguage = () => {
      const token = ++languageGeneration;
      const match = LanguageDescription.matchLanguageName(languages, node.attrs.language ?? "", true);
      if (match) void match.load().then(extension => { if (!destroyed && token === languageGeneration) cm.dispatch({ effects: languageCompartment.reconfigure(extension) }); }).catch(err => logError("Markdown code language failed", err));
      else cm.dispatch({ effects: languageCompartment.reconfigure([]) });
    };
    function render() {
      const token = ++generation;
      controllers.forEach(controller => controller.abort()); controllers = [];
      const lang = String(node.attrs.language ?? "").toLowerCase();
      const diagram = ["mermaid", "plantuml", "latex"].includes(lang);
      editor.hidden = diagram && !expanded; preview.hidden = !diagram;
      toggle.hidden = !diagram || !view.editable;
      toggle.textContent = tStatic(expanded ? "md.hideSource" : "md.editSourceBlock");
      language.readOnly = !view.editable;
      if (!diagram) return;
      const fence = "`".repeat(Math.max(3, ...Array.from(node.textContent.matchAll(/`+/g), m => m[0].length + 1)));
      const source = lang === "latex" ? `$$\n${node.textContent}\n$$` : `${fence}${lang}\n${node.textContent}\n${fence}`;
      void renderMarkdown(source, { theme }).then(html => {
        if (destroyed || token !== generation) return;
        preview.innerHTML = DOMPurify.sanitize(html);
        // Diagram source is inert data. Restore it after HTML sanitization,
        // which intentionally removes attributes containing arrow-like markup.
        const mermaid = preview.querySelector<HTMLElement>(".mermaid-diagram");
        if (mermaid) mermaid.dataset.mermaidSource = node.textContent;
        const plantuml = preview.querySelector<HTMLElement>(".plantuml-diagram");
        if (plantuml) plantuml.dataset.plantumlSource = node.textContent;
        controllers = [hydrateMermaid(preview, theme), hydratePlantuml(preview)];
      }).catch(err => { logError("Markdown code preview failed", err); if (!destroyed && token === generation) preview.textContent = String(err); });
    }
    toggle.onclick = () => { if (!view.editable) return; expanded = !expanded; render(); if (expanded) cm.focus(); };
    language.onchange = () => {
      if (!view.editable) return;
      const pos = getPos(); if (pos === undefined) return;
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, language: language.value.replace(/[\r\n`]/g, "") }));
    };
    const modeChanged = () => {
      updating = true;
      cm.dispatch({ effects: editableCompartment.reconfigure(EditorView.editable.of(view.editable)) });
      updating = false;
      if (!view.editable) expanded = false;
      render();
    };
    view.dom.addEventListener("deditor-editable-change", modeChanged);
    loadLanguage(); render();
    return { dom, stopEvent: () => true, ignoreMutation: () => true,
      update(next) {
        if (next.type !== node.type) return false;
        const languageChanged = next.attrs.language !== node.attrs.language;
        const textChanged = next.textContent !== node.textContent;
        node = next; updating = true;
        if (cm.state.doc.toString() !== node.textContent) cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: node.textContent } });
        cm.dispatch({ effects: editableCompartment.reconfigure(EditorView.editable.of(view.editable)) }); updating = false;
        language.value = node.attrs.language ?? "";
        if (languageChanged) loadLanguage();
        if (textChanged || languageChanged || language.readOnly === view.editable) render();
        return true;
      }, destroy() { view.dom.removeEventListener("deditor-editable-change", modeChanged); destroyed = true; generation++; controllers.forEach(controller => controller.abort()); cm.destroy(); },
    };
  };
}
