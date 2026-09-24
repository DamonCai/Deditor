import { diagramDrag } from "./diagramDrag";
import { diagramOverview } from "./diagramOverview";
import { exitBlockSource } from "./blockExit";
import { diagramSplit } from "./diagramSplit";
import { markdownMathContext } from "../markdownMath";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { EditorView as ProseView, NodeView } from "@milkdown/kit/prose/view";
import { NodeSelection, TextSelection, Selection } from "@milkdown/kit/prose/state";
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

export function codeView(tabId: string, initialTheme: "light" | "dark" | (() => "light" | "dark")) {
  return (initial: ProseNode, view: ProseView, getPos: () => number | undefined): NodeView => {
    let theme = typeof initialTheme === "function" ? initialTheme() : initialTheme;
    let node = initial, updating = false, generation = 0, languageGeneration = 0, destroyed = false, expanded = false;
    let suppressSelectionReveal = false;
    type DiagramMode = "edit" | "split" | "preview";
    let diagramMode: DiagramMode = "preview";
    let renderTimer: ReturnType<typeof setTimeout> | undefined;
    const hasDiagramModes = () => ["mermaid", "plantuml", "puml", "uml"].includes(String(node.attrs.language ?? "").toLowerCase());
    let controllers: AbortController[] = [];
    let renderedSource: string | null = null, pendingSource: string | null = null;
    const dom = document.createElement("section"); dom.className = "md-code-block"; dom.contentEditable = "false";
    const selectBlock = document.createElement("button"); selectBlock.className = "md-code-select"; selectBlock.type = "button";
    selectBlock.textContent = "⋮⋮"; selectBlock.title = tStatic("md.selectCodeBlock"); selectBlock.setAttribute("aria-label", tStatic("md.selectCodeBlock"));
    const selectNode = () => {
      if (!view.editable) return false;
      const pos = getPos(); if (pos === undefined) return false;
      if (!hasDiagramModes()) expanded = false; render();
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos))); view.focus(); return true;
    };
    selectBlock.onmousedown = event => event.preventDefault();
    selectBlock.onclick = selectNode;
    const bar = document.createElement("div"); bar.className = "md-code-bar";
    const dragHandle = document.createElement("button"); dragHandle.type = "button"; dragHandle.className = "deditor-btn md-diagram-drag"; dragHandle.dataset.variant = "ghost";
    dragHandle.textContent = "⠿"; dragHandle.title = tStatic("md.moveDiagram"); dragHandle.setAttribute("aria-label", tStatic("md.moveDiagram"));
    const language = document.createElement("input"); language.className = "deditor-input deditor-input--compact";
    language.setAttribute("aria-label", tStatic("md.codeLanguage")); language.value = node.attrs.language ?? "";
    const toggle = document.createElement("button"); toggle.className = "deditor-btn md-code-toggle"; toggle.dataset.variant = "ghost";
    const copy = document.createElement("button"); copy.className = "deditor-btn"; copy.dataset.variant = "ghost"; copy.textContent = tStatic("editor.copy");
    copy.onclick = () => { void navigator.clipboard.writeText(node.textContent).catch(err => logError("Markdown code copy failed", err)); };
    const family = document.createElement("button"); family.type = "button"; family.className = "deditor-btn md-diagram-family"; family.dataset.variant = "ghost";
    family.title = tStatic("md.selectDiagram"); family.setAttribute("aria-label", tStatic("md.selectDiagram")); family.onmousedown = event => event.preventDefault(); family.onclick = selectNode;
    const familyIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg"); familyIcon.setAttribute("viewBox", "0 0 24 24"); familyIcon.setAttribute("aria-hidden", "true");
    const familyPath = document.createElementNS("http://www.w3.org/2000/svg", "path"); familyPath.setAttribute("d", "M8 3h8v5H8z M3 16h7v5H3z M14 16h7v5h-7z M12 8v4 M6.5 16v-4h11v4"); familyIcon.append(familyPath);
    const familyLabel = document.createElement("span"); family.append(familyIcon, familyLabel);
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "deditor-btn md-diagram-delete"; remove.dataset.variant = "ghost";
    remove.title = tStatic("md.deleteDiagram"); remove.setAttribute("aria-label", tStatic("md.deleteDiagram"));
    const removeIcon = familyIcon.cloneNode(false) as SVGElement, removePath = familyPath.cloneNode() as SVGElement;
    removePath.setAttribute("d", "M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7"); removeIcon.append(removePath); remove.append(removeIcon);
    remove.onmousedown = event => event.preventDefault();
    remove.onclick = () => {
      const pos = getPos(); if (!view.editable || pos === undefined) return;
      const tr = view.state.tr.delete(pos, pos + node.nodeSize);
      tr.setSelection(Selection.near(tr.doc.resolve(Math.min(pos, tr.doc.content.size))));
      view.dispatch(tr.setMeta('deditor-list-operation', true).scrollIntoView()); view.focus();
    };
    const modes = document.createElement("div"); modes.className = "deditor-segments md-diagram-modes";
    modes.setAttribute("role", "group"); modes.setAttribute("aria-label", tStatic("md.diagramMode"));
    const modeButtons = (["edit", "split", "preview"] as const).map(mode => {
      const button = document.createElement("button"); button.type = "button"; button.className = "deditor-segment";
      button.dataset.mode = mode; button.textContent = tStatic({ edit: "md.viewEdit", split: "md.viewSplit", preview: "md.viewPreview" }[mode]);
      button.onclick = () => setDiagramMode(mode);
      modes.append(button); return button;
    });
    bar.append(dragHandle, language, family, toggle, modes, remove, copy);
    const editor = document.createElement("div"), preview = document.createElement("div"); preview.className = "md-code-preview"; editor.className = "md-code-editor";
    const body = document.createElement("div"); body.className = "md-code-body";
    const split = diagramSplit(body); body.append(editor, split.separator, preview);
    dom.append(selectBlock, bar, body);
    const overview = diagramOverview(dom, bar, body, preview);
    const drag = diagramDrag(view, dom, dragHandle, getPos);
    bar.insertBefore(overview.controls, remove); bar.insertBefore(overview.button, remove);
    const closeOverview = () => overview.close(false);
    view.dom.addEventListener("deditor-diagram-overview-close", closeOverview);
    function setDiagramMode(mode: DiagramMode) {
      if (!view.editable || !hasDiagramModes()) return;
      const pos = getPos();
      if (mode === "preview" && pos !== undefined && view.state.selection instanceof NodeSelection
        && view.state.selection.from === pos) {
        modeButtons.find(button => button.dataset.mode === mode)?.focus({ preventScroll: true });
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1)));
      }
      diagramMode = mode; expanded = mode !== "preview"; render();
      if (expanded) ensureEditor().focus();
      else {
        // Switching the display is not a request to select the entire block.
        // Keep focus on the mode control instead of creating a blue node outline.
        modeButtons.find(button => button.dataset.mode === mode)?.focus({ preventScroll: true });
      }
    }
    const languageCompartment = new Compartment(), editableCompartment = new Compartment(), presentationCompartment = new Compartment(), themeCompartment = new Compartment();
    let presentation: Extension = [], presentationGeneration = 0;
    const wrapping = new Compartment(), indentation = new Compartment();
    const settings = useEditorStore.getState().markdownSettings;
    let cm: EditorView | null = null;
    const ensureEditor = () => {
      if (cm) return cm;
      cm = new EditorView({ parent: editor, state: EditorState.create({ doc: node.textContent, extensions: [basicSetup, wrapping.of(settings.codeWrap ? EditorView.lineWrapping : []), indentation.of(indentUnit.of(" ".repeat(settings.codeIndent))),
      themeCompartment.of(EditorView.theme({}, { dark: theme === "dark" })), presentationCompartment.of(presentation), languageCompartment.of([]), editableCompartment.of([EditorView.editable.of(view.editable), EditorState.readOnly.of(!view.editable)]),
      Prec.highest(keymap.of([
        indentWithTab,
        { key: "Mod-Enter", run: () => exitBlockSource(view, node, getPos(), 1) },
        { key: "Mod-z", run: () => !view.editable || markdownHistory(false, tabId) }, { key: "Mod-Shift-z", run: () => !view.editable || markdownHistory(true, tabId) },
        { key: "Escape", run: () => {
          const pos = getPos();
          if (pos !== undefined) view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
          diagramMode = "preview"; expanded = false; render(); view.focus(); return true;
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
          if (update.transactions.some(transaction => transaction.isUserEvent("input.paste") || transaction.isUserEvent("delete.cut"))) tr.setMeta("deditor-list-operation", true);
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
    function render(debounce = false) {
      const lang = String(node.attrs.language ?? "").toLowerCase();
      const diagram = ["mermaid", "plantuml", "puml", "uml", "latex", "flow", "sequence"].includes(lang);
      dom.dataset.kind = lang === "latex" ? "math" : diagram ? "diagram" : "code";
      const threeModes = hasDiagramModes();
      // Diagram previews stay in document flow and follow the rendered SVG height,
      // including after mode switches, source edits and split-pane resizing.
      dom.classList.toggle("md-diagram-block", threeModes);
      overview.setEnabled(threeModes);
      split.setEnabled(threeModes && diagramMode === "split" && view.editable);
      dom.dataset.diagramMode = threeModes ? diagramMode : "";
      if (threeModes) expanded = diagramMode !== "preview";
      modes.hidden = !threeModes || !view.editable;
      dragHandle.hidden = !threeModes || !view.editable;
      if (!threeModes || !view.editable) drag.cancel();
      family.hidden = !threeModes; family.disabled = !view.editable; remove.hidden = !threeModes || !view.editable;
      if (threeModes) copy.remove();
      else if (!copy.isConnected) bar.append(copy);
      familyLabel.textContent = lang === "mermaid" ? "Mermaid" : "PlantUML";
      language.hidden = threeModes;
      preview.tabIndex = threeModes && view.editable ? 0 : -1;
      if (threeModes) preview.setAttribute("aria-label", tStatic("md.diagramPreview"));
      else preview.removeAttribute("aria-label");
      modeButtons.forEach(button => {
        const selected = button.dataset.mode === diagramMode;
        button.dataset.selected = String(selected); button.setAttribute("aria-pressed", String(selected));
        button.disabled = !view.editable;
      });
      // Keep the surrounding article still when a tall diagram becomes a short source block.
      if (!threeModes && expanded && editor.hidden) editor.style.minHeight = `${dom.getBoundingClientRect().height}px`;
      if (threeModes) editor.style.minHeight = "";
      editor.hidden = !expanded; preview.hidden = expanded && (!threeModes || diagramMode === "edit");
      if (expanded) ensureEditor();
      overview.refresh();
      toggle.hidden = threeModes || (!diagram && lang !== "html") || !view.editable;
      toggle.textContent = tStatic(expanded ? "md.hideSource" : "md.editSourceBlock");
      language.readOnly = !view.editable;
      selectBlock.hidden = !view.editable || threeModes;
      const code = node.textContent;
      const fence = "`".repeat(Math.max(3, ...Array.from(code.matchAll(/`+/g), m => m[0].length + 1)));
      const source = lang === "latex" ? `$$\n${code}\n$$` : `${fence}${lang}\n${code}\n${fence}`;
      const settings = useEditorStore.getState().markdownSettings;
      const documentSource = lang === "latex" ? useEditorStore.getState().tabs.find(tab => tab.id === tabId)?.content ?? source : source;
      const contextual = lang === "latex" && (settings.mathAutoNumber || /\\(?:label|eqref|ref)\{/.test(code));
      const math = contextual ? markdownMathContext(documentSource) : null;
      const renderKey = theme + ":" + source + (math ? JSON.stringify([settings.mathAutoNumber, math.blocks]) : "");
      let ordinal = 0;
      if (contextual) view.state.doc.descendants((node, pos) => {if(pos < (getPos() ?? 0) && node.type.name === "code_block" && String(node.attrs.language).toLowerCase() === "latex") ordinal++;});
      // Editing and focus changes do not invalidate the rendered projection. In particular,
      // never replace a live SVG with its loading placeholder on each source keystroke.
      if (pendingSource !== null && pendingSource !== renderKey) {
        generation++; pendingSource = null;
        controllers.forEach(controller => controller.abort()); controllers = [];
      }
      if (renderTimer) { clearTimeout(renderTimer); renderTimer = undefined; }
      if (preview.hidden || renderKey === renderedSource || renderKey === pendingSource) return;
      if (threeModes && !code.trim()) {
        const empty = document.createElement("div"); empty.className = "deditor-notice";
        empty.setAttribute("role", "status"); empty.textContent = tStatic("md.diagramEmpty");
        preview.replaceChildren(empty); renderedSource = renderKey; return;
      }
      if (debounce && threeModes && diagramMode === "split") {
        renderTimer = setTimeout(() => { renderTimer = undefined; render(); }, 250); return;
      }
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
        const tab = useEditorStore.getState().tabs.find(tab => tab.id === tabId);
        const display = hydrateMarkdownDisplay(staging, { theme, filePath: tab?.filePath });
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
      if (!view.editable || event.button !== 0 || overview.isOpen) return;
      if ((event.target as Element).closest("audio,video,iframe,button,input,select,textarea,summary,a")) return;
      event.preventDefault();
      if (hasDiagramModes()) { selectNode(); return; }
      expanded = true; render();
      const active = ensureEditor();
      const pos = active.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos !== null) active.dispatch({ selection: { anchor: pos } });
      active.focus();
    };
    preview.onkeydown = event => {
      if (!view.editable || event.key !== "Enter") return;
      if ((event.target as Element).closest("audio,video,iframe,button,input,select,textarea,summary,a")) return;
      event.preventDefault(); event.stopPropagation();
      if (hasDiagramModes()) { setDiagramMode("split"); return; }
      expanded = true; render(); ensureEditor().focus();
    };
    preview.ondblclick = event => {
      if (!view.editable || !hasDiagramModes()) return;
      event.preventDefault(); setDiagramMode("split");
    };
    const collapse = (event: FocusEvent) => {
      if (hasDiagramModes()) return;
      if (dom.contains(event.relatedTarget as Node | null) || event.relatedTarget instanceof Element && event.relatedTarget.closest(".md-editor-menu")) return;
      if (expanded) { expanded = false; render(); }
    };
    const menuClosed = () => queueMicrotask(() => {
      if (!destroyed && !hasDiagramModes() && expanded && !dom.contains(document.activeElement)) { expanded = false; render(); }
    });
    view.dom.addEventListener("deditor-contextmenu-close", menuClosed);
    dom.addEventListener("focusout", collapse);

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
      if (!view.editable) { expanded = false; diagramMode = "preview"; }
      render();
    };
    const restoreFocus = () => {
      // A remembered caret can live inside this node while switching files or
      // entering Reading Edit. Keep the rendered projection visible until the
      // user actually clicks or keyboards into the block.
      if (!hasDiagramModes() && expanded) { expanded = false; render(); }
      suppressSelectionReveal = true;
      queueMicrotask(() => { suppressSelectionReveal = false; });
    };
    view.dom.addEventListener("deditor-editable-change", modeChanged);
    view.dom.addEventListener("deditor-restore-focus", restoreFocus);
    const configure = () => {
      const settings = useEditorStore.getState().markdownSettings;
      dom.dataset.lineNumbers = String(settings.codeLineNumbers);
      cm?.dispatch({effects:[wrapping.reconfigure(settings.codeWrap ? EditorView.lineWrapping : []), indentation.reconfigure([indentUnit.of(" ".repeat(settings.codeIndent)), EditorState.tabSize.of(settings.codeIndent)])]});
    };
    const settingsChanged = () => {configure(); render();};
    const themeChanged = (event: Event) => {
      const next = (event as CustomEvent<"light" | "dark">).detail;
      if (next !== "light" && next !== "dark" || next === theme) return;
      theme = next;
      updating = true;
      cm?.dispatch({ effects: themeCompartment.reconfigure(EditorView.theme({}, { dark: theme === "dark" })) });
      updating = false;
      loadPresentation(); render();
    };
    const documentChanged = () => {if (String(node.attrs.language).toLowerCase() === "latex") render();};
    view.dom.addEventListener("deditor-writing-change", settingsChanged);
    view.dom.addEventListener("deditor-theme-change", themeChanged);
    view.dom.addEventListener("deditor-document-change", documentChanged);
    configure(); loadLanguage(); loadPresentation(); render();
    return { dom, stopEvent: () => true, ignoreMutation: () => true,
      setSelection(anchor, head) {
        if (!view.editable) return;
        if (suppressSelectionReveal) { suppressSelectionReveal = false; return; }
        if (editor.hidden) { expanded = true; if (hasDiagramModes()) diagramMode = "split"; render(); }
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
        if (textChanged || languageChanged || language.readOnly === view.editable) render(textChanged && !languageChanged);
        return true;
      }, destroy() { drag.destroy(); overview.destroy(); view.dom.removeEventListener("deditor-diagram-overview-close", closeOverview); split.destroy(); view.dom.removeEventListener("deditor-contextmenu-close", menuClosed); view.dom.removeEventListener("deditor-writing-change", settingsChanged); view.dom.removeEventListener("deditor-theme-change", themeChanged); view.dom.removeEventListener("deditor-document-change", documentChanged); view.dom.removeEventListener("deditor-editable-change", modeChanged); view.dom.removeEventListener("deditor-restore-focus", restoreFocus); dom.removeEventListener("focusout", collapse); destroyed = true; generation++; if (renderTimer) clearTimeout(renderTimer); controllers.forEach(controller => controller.abort()); cm?.destroy(); },
    };
  };
}
