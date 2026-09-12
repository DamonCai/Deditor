import { exitBlockSource } from "./blockExit";
import { markdownMathContext } from "../markdownMath";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { EditorView as ProseView, NodeView } from "@milkdown/kit/prose/view";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState, Prec, Compartment, type Extension } from "@codemirror/state";
import { basicSetup } from "codemirror";
import { indentWithTab } from "@codemirror/commands";
import { useEditorStore } from "../../store/editor";
import { indentUnit } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { LanguageDescription } from "@codemirror/language";
import { markdownDisplayHtml, hydrateMarkdownDisplay } from "../markdownDisplay";
import { renderMarkdown } from "../markdown";
import { codePresentation } from "./codePresentation";
import { tStatic } from "../i18n";
import { markdownHistory } from "../markdownHistory";
import { logError } from "../logger";

export function codeView(tabId: string, theme: "light" | "dark") {
  return (initial: ProseNode, view: ProseView, getPos: () => number | undefined): NodeView => {
    let node = initial, updating = false, generation = 0, languageGeneration = 0, destroyed = false, expanded = false;
    let controllers: AbortController[] = [];
    let renderedSource: string | null = null, pendingSource: string | null = null;
    const dom = document.createElement("section"); dom.className = "md-code-block"; dom.contentEditable = "false";
    const selectBlock = document.createElement("button"); selectBlock.className = "md-code-select"; selectBlock.type = "button";
    selectBlock.textContent = "⋮⋮"; selectBlock.title = tStatic("md.selectCodeBlock"); selectBlock.setAttribute("aria-label", tStatic("md.selectCodeBlock"));
    const selectNode = () => {
      if (!view.editable) return false;
      const pos = getPos(); if (pos === undefined) return false;
      expanded = false; render();
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos))); view.focus(); return true;
    };
    selectBlock.onmousedown = event => event.preventDefault();
    selectBlock.onclick = selectNode;
    const bar = document.createElement("div"); bar.className = "md-code-bar";
    const language = document.createElement("input"); language.className = "deditor-input deditor-input--compact";
    language.setAttribute("aria-label", tStatic("md.codeLanguage")); language.value = node.attrs.language ?? "";
    const toggle = document.createElement("button"); toggle.className = "deditor-btn md-code-toggle"; toggle.dataset.variant = "ghost";
    const copy = document.createElement("button"); copy.className = "deditor-btn"; copy.dataset.variant = "ghost"; copy.textContent = tStatic("editor.copy");
    copy.onclick = () => { void navigator.clipboard.writeText(node.textContent).catch(err => logError("Markdown code copy failed", err)); };
    bar.append(language, toggle, copy);
    const editor = document.createElement("div"), preview = document.createElement("div"); preview.className = "md-code-preview"; editor.className = "md-code-editor";
    dom.append(selectBlock, bar, editor, preview);
    const languageCompartment = new Compartment(), editableCompartment = new Compartment(), presentationCompartment = new Compartment();
    let presentation: Extension = [], presentationGeneration = 0;
    const wrapping = new Compartment(), indentation = new Compartment();
    const settings = useEditorStore.getState().markdownSettings;
    let cm: EditorView | null = null;
    const ensureEditor = () => {
      if (cm) return cm;
      cm = new EditorView({ parent: editor, state: EditorState.create({ doc: node.textContent, extensions: [basicSetup, wrapping.of(settings.codeWrap ? EditorView.lineWrapping : []), indentation.of(indentUnit.of(" ".repeat(settings.codeIndent))),
      EditorView.theme({}, { dark: theme === "dark" }), presentationCompartment.of(presentation), languageCompartment.of([]), editableCompartment.of([EditorView.editable.of(view.editable), EditorState.readOnly.of(!view.editable)]),
      Prec.highest(keymap.of([
        indentWithTab,
        { key: "Mod-Enter", run: () => exitBlockSource(view, node, getPos(), 1) },
        { key: "Mod-z", run: () => !view.editable || markdownHistory(false, tabId) }, { key: "Mod-Shift-z", run: () => !view.editable || markdownHistory(true, tabId) },
        { key: "Escape", run: () => {
          const pos = getPos();
          if (pos !== undefined) view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
          expanded = false; render(); view.focus(); return true;
        } },
        ...([-1, 1] as const).map(direction => ({ key: direction < 0 ? "ArrowUp" : "ArrowDown", run: () => {
          const selection = cm!.state.selection.main;
          if (!selection.empty) return false;
          const edge = direction < 0 ? 0 : cm!.state.doc.length;
          // Compare visual lines, so wrapped code still navigates within the block.
          if (selection.head !== edge) {
            const caret = cm!.coordsAtPos(selection.head), boundary = cm!.coordsAtPos(edge);
            if (!caret || !boundary || Math.abs(caret.top - boundary.top) > 1) return false;
          }
          return exitBlockSource(view, node, getPos(), direction);
        } })),
      ])),
      EditorView.updateListener.of(update => {
        if (updating) return;
        const pos = getPos(); if (pos === undefined) return;
        if (update.docChanged || update.view.hasFocus && (update.selectionSet || update.focusChanged)) {
          const tr = view.state.tr; let offset = pos + 1;
          update.changes.iterChanges((fromA, toA, fromB, toB, text) => {
            tr.replaceWith(offset + fromA, offset + toA, text.length ? view.state.schema.text(text.toString()) : []); offset += (toB - fromB) - (toA - fromA);
          });
          tr.setSelection(TextSelection.create(tr.doc, pos + 1 + update.state.selection.main.anchor, pos + 1 + update.state.selection.main.head));
          view.dispatch(tr);
        }
      }),
    ] }) });
      configure(); loadLanguage(); return cm;
    };
    const loadLanguage = () => {
      if (!cm) return;
      const token = ++languageGeneration;
      const match = LanguageDescription.matchLanguageName(languages, node.attrs.language ?? "", true);
      if (match) void match.load().then(extension => { if (!destroyed && token === languageGeneration) cm?.dispatch({ effects: languageCompartment.reconfigure(extension) }); }).catch(err => logError("Markdown code language failed", err));
      else cm?.dispatch({ effects: languageCompartment.reconfigure([]) });
    };
    const loadPresentation = () => {
      const token = ++presentationGeneration;
      void codePresentation(node.attrs.language ?? "", theme).then(extension => {
        if (destroyed || token !== presentationGeneration) return;
        presentation = extension;
        cm?.dispatch({ effects: presentationCompartment.reconfigure(extension) });
      }).catch(err => logError("Markdown code highlighting failed", err));
    };
    function render() {
      const lang = String(node.attrs.language ?? "").toLowerCase();
      const diagram = ["mermaid", "plantuml", "puml", "uml", "latex", "flow", "sequence"].includes(lang);
      dom.dataset.kind = lang === "latex" ? "math" : diagram ? "diagram" : "code";
      // Keep the surrounding article still when a tall diagram becomes a short source block.
      if (expanded && editor.hidden) editor.style.minHeight = `${dom.getBoundingClientRect().height}px`;
      editor.hidden = !expanded; preview.hidden = expanded;
      if (expanded) ensureEditor();
      toggle.hidden = !diagram || !view.editable;
      toggle.textContent = tStatic(expanded ? "md.hideSource" : "md.editSourceBlock");
      language.readOnly = !view.editable;
      selectBlock.hidden = !view.editable;
      const code = node.textContent;
      const fence = "`".repeat(Math.max(3, ...Array.from(code.matchAll(/`+/g), m => m[0].length + 1)));
      const source = lang === "latex" ? `$$\n${code}\n$$` : `${fence}${lang}\n${code}\n${fence}`;
      const settings = useEditorStore.getState().markdownSettings;
      const documentSource = lang === "latex" ? useEditorStore.getState().tabs.find(tab => tab.id === tabId)?.content ?? source : source;
      const contextual = lang === "latex" && (settings.mathAutoNumber || /\\(?:label|eqref|ref)\{/.test(code));
      const math = contextual ? markdownMathContext(documentSource) : null;
      const renderKey = source + (math ? JSON.stringify([settings.mathAutoNumber, math.blocks]) : "");
      let ordinal = 0;
      if (contextual) view.state.doc.descendants((node, pos) => {if(pos < (getPos() ?? 0) && node.type.name === "code_block" && String(node.attrs.language).toLowerCase() === "latex") ordinal++;});
      // Editing and focus changes do not invalidate the rendered projection. In particular,
      // never replace a live SVG with its loading placeholder on each source keystroke.
      if (pendingSource !== null && pendingSource !== renderKey) {
        generation++; pendingSource = null;
        controllers.forEach(controller => controller.abort()); controllers = [];
      }
      if (expanded || renderKey === renderedSource || renderKey === pendingSource) return;
      const token = ++generation;
      pendingSource = renderKey;
      controllers.forEach(controller => controller.abort()); controllers = [];
      const staging = document.createElement("div");
      void renderMarkdown(source, { theme, documentSource, mathAutoNumber: settings.mathAutoNumber, mathOrdinal: ordinal }).then(async html => {
        if (destroyed || token !== generation) return;
        staging.innerHTML = markdownDisplayHtml(html);
        if (renderedSource === null && !preview.hasChildNodes()) {
          preview.append(...Array.from(staging.cloneNode(true).childNodes));
        }
        const display = hydrateMarkdownDisplay(staging, { theme });
        controllers = [display];
        await display.done;
        if (destroyed || token !== generation) return;
        preview.replaceChildren(...Array.from(staging.childNodes));
        renderedSource = renderKey; pendingSource = null;
      }).catch(err => {
        logError("Markdown code preview failed", err);
        if (!destroyed && token === generation) { pendingSource = null; preview.textContent = String(err); }
      });
    }
    preview.onmousedown = event => {
      if (!view.editable || event.button !== 0) return;
      event.preventDefault(); expanded = true; render();
      const active = ensureEditor();
      const pos = active.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos !== null) active.dispatch({ selection: { anchor: pos } });
      active.focus();
    };
    preview.onkeydown = event => {
      if (!view.editable || event.key !== "Enter") return;
      event.preventDefault(); event.stopPropagation(); expanded = true; render(); ensureEditor().focus();
    };
    const collapse = (event: FocusEvent) => {
      if (dom.contains(event.relatedTarget as Node | null)) return;
      if (expanded) { expanded = false; render(); }
    };
    dom.addEventListener("focusout", collapse);
    dom.oncontextmenu = event => {
      if (dom.dataset.kind !== "code") return;
      event.preventDefault(); language.focus();
    };
    toggle.onclick = () => { if (!view.editable) return; expanded = !expanded; render(); if (expanded) ensureEditor().focus(); };
    language.onchange = () => {
      if (!view.editable) return;
      const pos = getPos(); if (pos === undefined) return;
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, language: language.value.replace(/[\r\n`]/g, "") }));
    };
    const modeChanged = () => {
      updating = true;
      cm?.dispatch({ effects: editableCompartment.reconfigure([EditorView.editable.of(view.editable), EditorState.readOnly.of(!view.editable)]) });
      updating = false;
      if (!view.editable) expanded = false;
      render();
    };
    view.dom.addEventListener("deditor-editable-change", modeChanged);
    const configure = () => {
      const settings = useEditorStore.getState().markdownSettings;
      dom.dataset.lineNumbers = String(settings.codeLineNumbers);
      cm?.dispatch({effects:[wrapping.reconfigure(settings.codeWrap ? EditorView.lineWrapping : []), indentation.reconfigure([indentUnit.of(" ".repeat(settings.codeIndent)), EditorState.tabSize.of(settings.codeIndent)])]});
    };
    const settingsChanged = () => {configure(); render();};
    const documentChanged = () => {if (String(node.attrs.language).toLowerCase() === "latex") render();};
    view.dom.addEventListener("deditor-writing-change", settingsChanged);
    view.dom.addEventListener("deditor-document-change", documentChanged);
    configure(); loadLanguage(); loadPresentation(); render();
    return { dom, stopEvent: () => true, ignoreMutation: () => true,
      setSelection(anchor, head) {
        if (!view.editable) return;
        if (editor.hidden) { expanded = true; render(); }
        updating = true;
        const active = ensureEditor();
        active.dispatch({ selection: { anchor: Math.min(anchor, active.state.doc.length), head: Math.min(head, active.state.doc.length) } });
        updating = false; active.focus();
      },
      update(next) {
        if (next.type !== node.type) return false;
        const languageChanged = next.attrs.language !== node.attrs.language;
        const textChanged = next.textContent !== node.textContent;
        node = next; updating = true;
        if (cm && cm.state.doc.toString() !== node.textContent) cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: node.textContent } });
        cm?.dispatch({ effects: editableCompartment.reconfigure([EditorView.editable.of(view.editable), EditorState.readOnly.of(!view.editable)]) }); updating = false;
        language.value = node.attrs.language ?? "";
        if (languageChanged) { loadLanguage(); loadPresentation(); }
        if (textChanged || languageChanged || language.readOnly === view.editable) render();
        return true;
      }, destroy() { view.dom.removeEventListener("deditor-writing-change", settingsChanged); view.dom.removeEventListener("deditor-document-change", documentChanged); view.dom.removeEventListener("deditor-editable-change", modeChanged); dom.removeEventListener("focusout", collapse); destroyed = true; generation++; controllers.forEach(controller => controller.abort()); cm?.destroy(); },
    };
  };
}
