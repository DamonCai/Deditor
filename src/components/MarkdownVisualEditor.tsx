import { imageClipboard } from "../lib/markdownVisual/imageClipboard";
import { markdownListKeys } from "../lib/markdownVisual/listKeys";
import { faithfulParagraph } from "../lib/markdownVisual/paragraph";
import { $view } from "@milkdown/kit/utils";
import { codeBlockView } from "@milkdown/kit/component/code-block";
import { footnoteOrder } from "../lib/markdownVisual/footnoteOrder";
import { mathView } from "../lib/markdownVisual/mathView";
import { loadKatex } from "../lib/markdown";
import { markdownInputAssist } from "../lib/markdownVisual/inputAssist";
import { decodeAnchor, openMarkdownFileLink } from "../lib/markdownLinks";
import MarkdownOutline from "./MarkdownOutline";
import MarkdownDocumentSurface from "./MarkdownDocumentSurface";
import { installFootnotePreview } from "../lib/markdownFootnotePreview";
import { documentImageDirectory, documentImageRoot, resolveMarkdownImage, markdownImageReference } from "../lib/markdownImageSettings";
import { shorthandRemark, highlightRemark, shorthandMarks, emojiSchema, shorthandInputRules, configureShorthand } from "../lib/markdownVisual/shorthand";
import { MarkdownSearch, markdownReplacement, type MarkdownMatch } from "../lib/markdownVisual/search";
import { nativeMarkdownCursor } from "../lib/markdownVisual/cursor";
import { strikethroughInputRule } from "@milkdown/kit/preset/gfm";
import { editableBlockquote, footnoteReference, footnoteDefinition, footnoteUpdates, footnoteNodeView } from "../lib/markdownVisual/structuredBlocks";
import { sharedHeadingIds } from "../lib/markdownVisual/headingIds";
import { installTypewriter } from "../lib/markdownVisual/typewriter";
import { pasteTableClipboard } from "../lib/markdownVisual/tablePaste";
import { pastePlainText } from "../lib/markdownVisual/plainTextPaste";
import { inlineSourceSchema, installInlineSource, inlineProjection } from "../lib/markdownVisual/inlineSource";
import { installCompositionViewport } from "../lib/markdownVisual/compositionViewport";
import { installMarkdownComposition } from "../lib/markdownComposition";
import { faithfulLink } from "../lib/markdownVisual/references";
import { absoluteHeadingInputRule } from "../lib/markdownVisual/heading";
import { activeBlockHint } from "../lib/markdownVisual/blockHint";
import { faithfulImage, accessibleImageView, rootAwareImageView } from "../lib/markdownVisual/image";
import { installMarkdownAccessibility, tableIcon } from "../lib/markdownVisual/accessibility";
import { openUrl } from "@tauri-apps/plugin-opener";
import { extendedTableCells, configureTableEditing } from "../lib/markdownVisual/tableLists";
import { inlineSchemas, faithfulInlineHtml, configureInlineSerialization } from "../lib/markdownVisual/inline";
import { codeView } from "../lib/markdownVisual/codeView";
import { codeBlockSchema, remarkInlineLinkPlugin, remarkPreserveEmptyLinePlugin, syncHeadingIdPlugin, wrapInHeadingInputRule } from "@milkdown/kit/preset/commonmark";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CrepeBuilder } from "@milkdown/crepe/builder";
import { codeMirror } from "@milkdown/crepe/feature/code-mirror";
import { table } from "@milkdown/crepe/feature/table";
import { listItem } from "@milkdown/crepe/feature/list-item";
import { linkTooltip } from "@milkdown/crepe/feature/link-tooltip";
import { imageBlock } from "@milkdown/crepe/feature/image-block";
import { latex } from "@milkdown/crepe/feature/latex";
import { cursor } from "@milkdown/crepe/feature/cursor";
import { EditorStatus, editorViewCtx, parserCtx, serializerCtx, editorViewOptionsCtx } from "@milkdown/kit/core";
import { history } from "@milkdown/kit/plugin/history";
import { trailing } from "@milkdown/kit/plugin/trailing";
import { goToNextCell, addRowAfter, isInTable } from "@milkdown/kit/prose/tables";
import { TextSelection, Selection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { convertFileSrc } from "@tauri-apps/api/core";
import { FiSearch, FiList, FiX, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { useEditorStore, useTabContent, useTabFilePath } from "../store/editor";
import { useT, tStatic } from "../lib/i18n";
import { MarkdownDocument } from "../lib/markdownVisual/document";
import { frontmatter, rawRemark, rawSchema } from "../lib/markdownVisual/raw";
import { rawView } from "../lib/markdownVisual/rawView";
import { visualCommands } from "../lib/markdownVisual/commands";
import { markdownSession, type MarkdownSession } from "../lib/markdownSession";
import { markdownHistory } from "../lib/markdownHistory";
import { setVisualEditor, getVisualEditor } from "../lib/markdownVisualBridge";
import { registerDocumentFlush } from "../lib/documentFlush";
import { dirname, isLocalRef } from "../lib/pathUtil";
import { saveImage } from "../lib/fileio";
import { logError } from "../lib/logger";
import { showError } from "../lib/feedback";
import { Button } from "./ui/Button";
import "@milkdown/crepe/theme/common/style.css";
import "./markdown-visual.css";

interface Runtime { session: MarkdownSession; crepe: CrepeBuilder; view: EditorView; document: MarkdownDocument; sync: (source: string) => void; flush: () => void; closeInline: () => void; outline: () => void; publish: () => void; restoreCursor: () => void }
export default function MarkdownVisualEditor({ tabId, readonly = false, active = true, theme }: { tabId: string; readonly?: boolean; active?: boolean; theme: "light" | "dark" }) {
  const t = useT();
  const source = useTabContent(tabId), filePath = useTabFilePath(tabId);
  const language = useEditorStore(s => s.language);
  const writing = useEditorStore(s => s.markdownSettings);
  const fontSize = useEditorStore(s => s.tabs.find(tab => tab.id === tabId)?.zoomFontSize ?? s.editorFontSize);
  const root = useRef<HTMLDivElement>(null), scroller = useRef<HTMLDivElement>(null), searchInput = useRef<HTMLInputElement>(null);
  const runtime = useRef<Runtime | null>(null), readonlyRef = useRef(readonly), sourceRef = useRef(source), activeRef = useRef(active);
  readonlyRef.current = readonly; sourceRef.current = source; activeRef.current = active;
  const imageRoot = documentImageRoot(source, filePath);
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [ready, setReady] = useState(false), [searchOpen, setSearchOpen] = useState(false), [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [searchOptions, setSearchOptions] = useState({ caseSensitive: false, wholeWord: false, regex: false });
  const [searchError, setSearchError] = useState(false);
  const searchKey = JSON.stringify([query, searchOptions]);
  const [tocOpen, setTocOpen] = useState(false), [headings, setHeadings] = useState<{ pos: number; level: number; text: string }[]>([]);
  const [activeHeading, setActiveHeading] = useState(-1);
  const headingPositions = useRef<{pos: number}[]>([]);
  const tocOpenRef = useRef(tocOpen); tocOpenRef.current = tocOpen;
  const [matchCount, setMatchCount] = useState(0), [matchIndex, setMatchIndex] = useState(0);
  const lastSearch = useRef({ query: "", open: false });
  const matches = useRef<MarkdownMatch[]>([]);
  const searchIndex = useRef(new MarkdownSearch());
  const openSearch = () => { setSearchOpen(true); searchInput.current?.focus(); };
  const closeSearch = () => { setSearchOpen(false); runtime.current?.view.focus(); };
  const select = (from: number, to = from) => {
    const view = runtime.current?.view; if (!view) return;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)).scrollIntoView());
  };
  useEffect(() => {
    let cancelled = false, cleanupFlush = () => {}, cleanupInput = () => {}, cleanupAccessibility = () => {}, cleanupCompositionViewport = () => {}, cleanupInlineSource = () => {}, cleanupTypewriter = () => {}, cleanupFootnotes = () => {};
    setReady(false); setError("");
    const host = document.createElement("div"); root.current!.append(host);
    const session = markdownSession(tabId, sourceRef.current); session.breakGroup();
    const mdx = /\.mdx$/i.test(filePath ?? "");
    const upload = async (file: File) => {
      const base = filePath ? dirname(filePath) : useEditorStore.getState().workspaces[0];
      if (!base) { const message = tStatic("editor.pasteImageNoTarget"); void showError(message); throw new Error(message); }
      const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg" } as Record<string, string>)[file.type] ?? "png";
      const name = `image-${crypto.randomUUID()}.${ext}`;
      const bytes = new Uint8Array(await file.arrayBuffer()); let binary = "";
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      try { const folder = documentImageDirectory(sourceRef.current, filePath, useEditorStore.getState().markdownSettings.imageDirectory); await saveImage(base, name, btoa(binary), folder); return markdownImageReference(folder, name); }
      catch (err) { logError("Markdown image upload failed", err); void showError(String(err)); throw err; }
    };
    const clipboardImages = imageClipboard(upload, () => activeRef.current && !readonlyRef.current && !cancelled, () => session.breakGroup());
    const initialSource = sourceRef.current;
    const codeNodeView = codeView(tabId, theme);
    const crepe = new CrepeBuilder({ root: host, defaultValue: initialSource })
      .addFeature(codeMirror)
      .addFeature(table, {
        addRowIcon: tableIcon(t("md.addRow"), "plus"), addColIcon: tableIcon(t("md.addColumn"), "plus"),
        deleteRowIcon: tableIcon(t("md.deleteRow"), "minus"), deleteColIcon: tableIcon(t("md.deleteColumn"), "minus"),
        alignLeftIcon: tableIcon(t("md.alignLeft"), "left"), alignCenterIcon: tableIcon(t("md.alignCenter"), "center"), alignRightIcon: tableIcon(t("md.alignRight"), "right"),
      }).addFeature(listItem).addFeature(cursor, { virtual: false })
      .addFeature(linkTooltip, { inputPlaceholder: t("md.linkUrl") })
      .addFeature(imageBlock, { onUpload: upload,
        proxyDomURL: url => {
          const path = resolveMarkdownImage(url, filePath, documentImageRoot(sourceRef.current, filePath));
          return path === null ? url : convertFileSrc(path);
        },
        inlineUploadButton: t("md.uploadImage"), blockUploadButton: t("md.uploadImage"), blockConfirmButton: t("common.confirm"),
        inlineUploadPlaceholderText: t("md.imageUrlLabel"), blockUploadPlaceholderText: t("md.imageUrlLabel"), blockCaptionPlaceholderText: t("md.imageTitleLabel") })
      .addFeature(latex);
    crepe.editor.use(clipboardImages.plugin).use(shorthandRemark).use(highlightRemark).use(shorthandMarks.flat()).use(emojiSchema).use(shorthandInputRules).config(configureShorthand).use(editableBlockquote).use(footnoteReference).use(footnoteDefinition).use(footnoteUpdates).use(footnoteOrder).use(inlineSourceSchema).use(absoluteHeadingInputRule).use(activeBlockHint).use(sharedHeadingIds).use(faithfulParagraph).use(faithfulLink).use(faithfulInlineHtml).use(faithfulImage).use(extendedTableCells.flat()).config(configureTableEditing).use(inlineSchemas.flat()).config(configureInlineSerialization).use(frontmatter).use(rawRemark(mdx)).use(rawSchema);
    crepe.editor.config(ctx => ctx.update(editorViewOptionsCtx, prev => ({ ...prev, attributes: { class: "md-document", "aria-label": t("md.visualEditor"), spellcheck: "false" },
      handleKeyDown: (view, event) => {
        if (event.key !== "Tab" || !view.editable || !isInTable(view.state)) return false;
        event.preventDefault();
        if (goToNextCell(event.shiftKey ? -1 : 1)(view.state, view.dispatch)) return true;
        if (!event.shiftKey && addRowAfter(view.state, view.dispatch)) goToNextCell(1)(view.state, view.dispatch);
        return true;
      },
      handlePaste: (view, event, slice) => clipboardImages.paste(view, event) || pasteTableClipboard(view, event) || pastePlainText(view, event, slice, ctx.get(parserCtx)),
      handleDOMEvents: { ...prev.handleDOMEvents,
      mousedown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && (event.target as HTMLElement).closest("a")) { event.preventDefault(); return true; }
        return false;
      },
      click: (view, event) => {
        const link = (event.target as HTMLElement).closest("a");
        if (!link) return false;
        event.preventDefault();
        const href = link.getAttribute("href") ?? "";
        if (!readonlyRef.current && !event.metaKey && !event.ctrlKey) return true;
        if (href.startsWith("#")) {
          const id = decodeAnchor(href.slice(1));
          Array.from(view.dom.querySelectorAll<HTMLElement>("[id]")).find(el => decodeAnchor(el.id) === id)?.scrollIntoView({ block: "start" });
        } else if (/^(https?:|mailto:)/i.test(href)) void openUrl(href).catch(err => logError("Markdown link open failed", err));
        else if (isLocalRef(href)) void openMarkdownFileLink(href, filePath).catch(err => logError("Markdown local link open failed", err));
        return true;
      } },
    })));
    crepe.editor.use(nativeMarkdownCursor).use(markdownInputAssist).use(markdownListKeys);
    // A rendered ProseMirror may exist before asynchronous startup has installed
    // fidelity/history and restored the cursor. Accept input only after that boundary.
    crepe.setReadonly(true);
    const initialize = async () => {
      if (/\\(?:ce|pu)\{/.test(initialSource)) await loadKatex();
      await crepe.editor.remove(codeBlockView);
      crepe.editor.use($view(codeBlockSchema.node, () => codeNodeView));
      await crepe.editor.remove(history); await crepe.editor.remove(trailing);
      await crepe.editor.remove(wrapInHeadingInputRule); await crepe.editor.remove(strikethroughInputRule);
      await crepe.editor.remove(syncHeadingIdPlugin);
      await crepe.editor.remove(remarkInlineLinkPlugin.plugin);
      await crepe.editor.remove(remarkPreserveEmptyLinePlugin.plugin);
      // A mode/tab switch (or StrictMode cleanup) can cancel this asynchronous
      // setup. Do not parse the whole document into an already detached host.
      if (cancelled) return;
      await crepe.create();
      if (cancelled) return;
      crepe.editor.action(ctx => {
        const view = ctx.get(editorViewCtx), parse = ctx.get(parserCtx), serialize = ctx.get(serializerCtx);
        const document = new MarkdownDocument(initialSource, parse, serialize, mdx, view.state.doc);
        let inlineEditing: ReturnType<typeof installInlineSource> | undefined;
        let enterOperation = false;
        const historyState = () => ({ document: document.snapshot(), selection: { anchor: view.state.selection.anchor, head: view.state.selection.head }, sourceSelection: { anchor: document.sourceOffset(view.state.selection.anchor), head: document.sourceOffset(view.state.selection.head) } });
        const publish = () => {
          if (cancelled || !activeRef.current) return;
          const bridge = visualCommands(view, tabId, parse, () => session.breakGroup());
          const fresh = () => { inlineEditing?.close(); return visualCommands(view, tabId, parse, () => session.breakGroup()); };
          bridge.wrap = (...args) => fresh().wrap(...args);
          bridge.prefix = (...args) => fresh().prefix(...args);
          bridge.insert = (...args) => fresh().insert(...args);
          bridge.color = (...args) => fresh().color(...args);
          bridge.link = (...args) => fresh().link(...args);
          bridge.capture = () => fresh().capture();
          bridge.find = openSearch;
          bridge.navigate = (line, column = 1) => {
            const lines = document.source.split("\n");
            const offset = lines.slice(0, Math.max(0, line - 1)).reduce((n, text) => n + text.length + 1, 0) + column - 1;
            const pos = document.positionAtSource(offset);
            view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(pos))).scrollIntoView()); view.focus();
          };
          setVisualEditor(bridge);
          if (tocOpenRef.current) {
            const current = [...headingPositions.current].reverse().find(heading => heading.pos <= view.state.selection.head);
            setActiveHeading(current?.pos ?? -1);
          }
          session.sourceCursor = document.sourceOffset(view.state.selection.head);
          const store = useEditorStore.getState();
          store.setTabPosition(tabId, { cursor: session.sourceCursor, scrollTopLine: store.tabPositions[tabId]?.scrollTopLine ?? 1 });
          useEditorStore.getState().setActiveSelectionLength(view.state.selection.to - view.state.selection.from);
        };
        const outline = () => {
          if (!activeRef.current || !tocOpenRef.current) return;
          const result: { pos: number; level: number; text: string }[] = [];
          view.state.doc.descendants((node, pos) => { if (node.type.name === "heading") result.push({ pos: pos + 1, level: node.attrs.level, text: node.textContent }); });
          headingPositions.current = result;
          setHeadings(result);
        };
        const flush = () => {
          const content = document.apply(view.state.doc);
          const live = useEditorStore.getState().tabs.find(tab => tab.id === tabId);
          if (live && live.content !== content) useEditorStore.getState().setContent(content, tabId, "visual");
        };
        const compositionViewport = installCompositionViewport(view.dom, scroller.current!);
        cleanupCompositionViewport = compositionViewport.destroy;
        const typewriter = installTypewriter(view, scroller.current!);
        cleanupTypewriter = typewriter.destroy;
        cleanupFootnotes = installFootnotePreview(view.dom, language);
        const originalImageView = view.props.nodeViews?.["image-block"];
        const originalInlineImageView = view.props.nodeViews?.image;
        view.setProps({ nodeViews: { ...view.props.nodeViews, ...(originalImageView ? { "image-block": accessibleImageView(originalImageView, language) } : {}), ...(originalInlineImageView ? { image: rootAwareImageView(originalInlineImageView) } : {}), math_inline: mathView(tabId), footnote_reference: footnoteNodeView, footnote_definition: footnoteNodeView, deditor_raw: rawView(filePath, tabId), code_block: codeNodeView },
          handleScrollToSelection: () => compositionViewport.handleScroll(),
          dispatchTransaction: tr => {
            if (cancelled) return;
            const changed = tr.docChanged && !tr.getMeta(inlineProjection);
            const before = changed && !inlineEditing?.active ? historyState() : null;
            const version = session.version;
            const enter = changed && enterOperation;
            if (enter) { enterOperation = false; session.breakGroup(); }
            const result = view.state.applyTransaction(tr);
            view.updateState(result.state);
            const projected = tr.getMeta(inlineProjection);
            if (!activeRef.current) return;
            if (inlineEditing?.apply(tr)) {
              if (!projected) flush();
            } else if (result.transactions.some(transaction => transaction.docChanged)) flush();
            if (result.transactions.some(transaction => transaction.docChanged)) { outline(); view.dom.dispatchEvent(new Event("deditor-document-change")); }
            session.visualSelection = { anchor: view.state.selection.anchor, head: view.state.selection.head };
            publish();
            if (changed && session.version !== version) session.recordVisual(before, inlineEditing?.active ? null : historyState());
            inlineEditing?.update();
            if (enter) session.breakGroup();
            if (!projected && (tr.docChanged || tr.selectionSet)) typewriter.update();
          },
        });
        inlineEditing = installInlineSource(view, document, () => session.breakGroup());
        cleanupInlineSource = inlineEditing.destroy;
        const sync = (content: string) => {
          if (document.source === content) return;
          if (view.composing || composition.composing) return;
          const hadFocus = view.dom.contains(view.dom.ownerDocument.activeElement);
          inlineEditing?.reset();
          const history = session.takeHistoryVisual();
          const next = history ? document.restore(content, history.document) : document.reset(content), selection = view.state.selection;
          const current = view.state.doc;
          let first = 0, from = 0, oldLast = current.childCount, newLast = next.childCount;
          while (first < oldLast && first < newLast && current.child(first).eq(next.child(first))) from += current.child(first++).nodeSize;
          let oldEnd = current.content.size, newEnd = next.content.size;
          while (oldLast > first && newLast > first && current.child(oldLast - 1).eq(next.child(newLast - 1))) {
            oldEnd -= current.child(--oldLast).nodeSize; newEnd -= next.child(--newLast).nodeSize;
          }
          const tr = view.state.tr;
          if (oldLast !== first || newLast !== first) tr.replaceWith(from, oldEnd, next.content.cut(from, newEnd));
          const changedFrom = current.content.findDiffStart(next.content), changedEnd = current.content.findDiffEnd(next.content);
          const mapPosition = (pos: number) => {
            if (changedFrom === null || pos <= changedFrom) return pos;
            if (changedEnd && changedEnd.a < current.content.size && pos >= changedEnd.a) return pos + changedEnd.b - changedEnd.a;
            return Math.min(pos, changedEnd?.b ?? pos);
          };
          const head = tr.doc.resolve(Math.min(history ? history.selection.head : mapPosition(selection.head), tr.doc.content.size));
          tr.setSelection(history || selection instanceof TextSelection
            ? TextSelection.between(tr.doc.resolve(Math.min(history ? history.selection.anchor : mapPosition(selection.anchor), tr.doc.content.size)), head)
            : Selection.near(head));
          view.updateState(view.state.apply(tr.setMeta("addToHistory", false))); outline(); publish();
          // Undo can remove the focused CodeMirror node view. Restore the DOM
          // selection as well as the model selection before the next keystroke.
          if (history && hadFocus && !view.dom.contains(view.dom.ownerDocument.activeElement)) view.focus();
          view.dom.dispatchEvent(new Event("deditor-document-change"));
        };
        const beginEnter = () => {
          if (readonlyRef.current || view.composing || composition.composing) return;
          session.breakGroup();
          enterOperation = true;
        };
        const enterKey = (event: KeyboardEvent) => {
          enterOperation = false;
          if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229) beginEnter();
        };
        const beforeInput = (event: Event) => {
          const type = (event as InputEvent).inputType;
          if (["insertParagraph", "insertLineBreak"].includes(type) && !(event as InputEvent).isComposing && !enterOperation) beginEnter();
          if (type === "historyUndo" || type === "historyRedo") {
            event.preventDefault(); event.stopPropagation();
            if (!readonlyRef.current) markdownHistory(type === "historyRedo", tabId);
          }
        };
        const composition = installMarkdownComposition(view.dom, session, {
          settled: () => {
            if (cancelled || !activeRef.current) return;
            const live = useEditorStore.getState().tabs.find(tab => tab.id === tabId);
            if (live) sync(live.content);
            publish();
          },
        });
        view.dom.addEventListener("beforeinput", beforeInput, true);
        view.dom.addEventListener("keydown", enterKey, true);
        cleanupInput = () => { composition.destroy(); view.dom.removeEventListener("beforeinput", beforeInput, true); view.dom.removeEventListener("keydown", enterKey, true); };
        const restoreCursor = () => {
          const position = Math.min(view.state.doc.content.size, session.sourceCursor === null ? session.visualSelection.head : document.positionAtSource(session.sourceCursor));
          view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(position))));
          if (scroller.current) scroller.current.scrollTop = session.visualScroll;
        };
        runtime.current = { session, crepe, view, document, sync, flush, closeInline: () => inlineEditing?.close(), outline, publish, restoreCursor };
        if (activeRef.current) { sync(sourceRef.current); restoreCursor(); }
        cleanupFlush = registerDocumentFlush(tabId, () => { if (activeRef.current) flush(); });
        cleanupAccessibility = installMarkdownAccessibility(view);
        crepe.setReadonly(readonlyRef.current);
        view.dom.dispatchEvent(new Event("deditor-editable-change"));
        outline(); publish(); setReady(true);
      });
    };
    const initialization = initialize();
    let disposal: Promise<void> | undefined;
    const dispose = () => disposal ??= initialization.catch(() => {}).then(async () => {
      // Milkdown.destroy() polls forever when create() rejected in OnCreate.
      // Release any partial view directly in that case; never race destroy
      // against an initialization that is still using its context.
      if (crepe.editor.status === EditorStatus.OnCreate) {
        const ctx = crepe.editor.ctx;
        if (ctx.isInjected(editorViewCtx)) {
          const view = ctx.get(editorViewCtx);
          if (typeof view.destroy === "function" && !view.isDestroyed) view.destroy();
        }
      } else await crepe.destroy();
    }).catch(err => logError("Markdown visual editor cleanup failed", err));
    const releaseBindings = () => {
      cleanupFlush(); cleanupInput(); cleanupAccessibility(); cleanupCompositionViewport(); cleanupInlineSource(); cleanupTypewriter(); cleanupFootnotes();
      if (runtime.current?.crepe === crepe) runtime.current = null;
    };
    void initialization.catch(err => {
      logError("Markdown visual editor initialization failed", err);
      if (!cancelled) {
        releaseBindings();
        if (getVisualEditor()?.tabId === tabId) setVisualEditor(null);
        setReady(false); setError(String(err));
      }
      void dispose().then(() => host.replaceChildren());
    });
    return () => {
      // A path/language/theme remount may follow an external source replacement in the same batch.
      // Never let the outgoing view overwrite the newer store content during cleanup.
      const outgoing = runtime.current;
      if (outgoing && activeRef.current && useEditorStore.getState().tabs.find(tab => tab.id === tabId)?.content === outgoing.document.source) outgoing.flush();
      session.breakGroup(); if (activeRef.current) session.visualScroll = scroller.current?.scrollTop ?? session.visualScroll;
      cancelled = true; releaseBindings();
      if (getVisualEditor()?.tabId === tabId) setVisualEditor(null);
      void dispose(); host.remove();
    };
  }, [tabId, filePath, language, theme, loadAttempt]);
  useEffect(() => { if (active) runtime.current?.sync(source); }, [source, active]);
  useEffect(() => { if (tocOpen) runtime.current?.outline(); }, [tocOpen, ready]);
  useEffect(() => {
    const scroll = scroller.current, rt = runtime.current; if (!tocOpen || !ready || !scroll || !rt) return;
    let frame = 0;
    const changed = () => {
      if (frame || !scroll.clientHeight) return;
      frame = requestAnimationFrame(() => {
        frame = 0; const positions = headingPositions.current, top = scroll.getBoundingClientRect().top + 32;
        let low = 0, high = positions.length - 1, current = -1;
        while (low <= high) {
          const mid = (low + high) >> 1, node = rt.view.nodeDOM(positions[mid].pos - 1);
          if (node instanceof HTMLElement && node.getBoundingClientRect().top <= top) {current = positions[mid].pos; low = mid + 1;} else high = mid - 1;
        }
        setActiveHeading(current);
      });
    };
    scroll.addEventListener("scroll", changed); changed();
    return () => {scroll.removeEventListener("scroll", changed); cancelAnimationFrame(frame);};
  }, [tocOpen, ready]);
  useEffect(() => { runtime.current?.view.dom.dispatchEvent(new Event("deditor-image-root-change")); }, [imageRoot, ready]);
  const wasActive = useRef(active);
  useLayoutEffect(() => {
    const rt = runtime.current; if (!rt) return;
    if (!active || readonly) rt.view.dom.dispatchEvent(new Event("deditor-image-paste-cancel"));
    if (!active) {
      if (wasActive.current) {
        rt.closeInline(); rt.view.dom.blur(); rt.session.endComposition(); rt.session.breakGroup();
        setSearchOpen(false);
      }
      if (getVisualEditor()?.tabId === tabId) setVisualEditor(null);
    } else if (!wasActive.current) {
      // Synchronize once on return; source edits must never be overwritten by
      // the suspended projection, including save/close and external reloads.
      const sourceCursor = rt.session.sourceCursor;
      rt.sync(sourceRef.current);
      rt.session.sourceCursor = sourceCursor;
      rt.restoreCursor(); rt.outline();
    }
    if (readonly) rt.closeInline();
    // The hidden slot is inert. Toggling contenteditable on a very large DOM
    // would rebuild browser editing/accessibility state on every mode switch.
    if (root.current) root.current.inert = !active;
    if (rt.crepe.readonly !== readonly) {
      rt.crepe.setReadonly(readonly);
      rt.view.dom.dispatchEvent(new Event("deditor-editable-change"));
    }
    rt.session.breakGroup();
    if (active) rt.publish();
    wasActive.current = active;
  }, [active, readonly, ready, tabId]);
  useEffect(() => { if (runtime.current) {runtime.current.view.dom.spellcheck = writing.spellcheck; runtime.current.view.dom.dispatchEvent(new Event("deditor-writing-change"));} }, [writing, ready]);
  useEffect(() => { if (searchOpen) searchInput.current?.focus(); }, [searchOpen]);
  useEffect(() => {
    if (!searchOpen || !active) {
      lastSearch.current = { query: searchKey, open: false };
      matches.current = []; setMatchCount(0); setMatchIndex(0);
      return;
    }
    const found = runtime.current ? searchIndex.current.find(runtime.current.view.state.doc, query, searchOptions) : [];
    // Recompute results after edits, but only user search actions may move the caret.
    // A retained query must never reselect/overwrite a distant match while typing.
    const requested = searchOpen && (!lastSearch.current.open || lastSearch.current.query !== searchKey);
    lastSearch.current = { query: searchKey, open: searchOpen };
    matches.current = found; setMatchCount(found.length); setSearchError(searchIndex.current.error);
    if (requested) {
      setMatchIndex(0);
      if (found[0]) select(found[0].from, found[0].to);
    } else setMatchIndex(index => Math.min(index, Math.max(0, found.length - 1)));
  }, [query, searchKey, source, ready, searchOpen, active]);
  const navigate = (delta: number) => {
    if (!matches.current.length) return;
    const index = (matchIndex + delta + matches.current.length) % matches.current.length;
    setMatchIndex(index); const match = matches.current[index]; select(match.from, match.to);
  };
  const replaceMatches = (all: boolean) => {
    const rt = runtime.current;
    if (!rt || readonly || rt.view.composing) return;
    rt.closeInline(); rt.flush();
    const found = searchIndex.current.find(rt.view.state.doc, query, searchOptions);
    const targets = all ? found : found.slice(matchIndex, matchIndex + 1);
    if (!targets.length) return;
    rt.session.breakGroup();
    const tr = rt.view.state.tr;
    for (const match of [...targets].reverse()) {
      const value = markdownReplacement(match, replacement, searchOptions.regex);
      // Preserve the text style at each match without parsing replacement as Markdown.
      const marks = tr.doc.resolve(match.from).marks();
      if (value) tr.replaceWith(match.from, match.to, tr.doc.type.schema.text(value, marks));
      else tr.delete(match.from, match.to);
    }
    rt.view.dispatch(tr); rt.flush(); rt.session.breakGroup();
    if (!all) {
      // Skip the inserted text even when it still contains the query. Repeated
      // Replace current should progress through the document, then wrap.
      const after = tr.mapping.map(targets[0].to, 1);
      const remaining = searchIndex.current.find(rt.view.state.doc, query, searchOptions);
      const nextIndex = Math.max(0, remaining.findIndex(match => match.from >= after));
      matches.current = remaining;
      setMatchCount(remaining.length); setMatchIndex(nextIndex);
      const next = remaining[nextIndex];
      if (next) select(next.from, next.to);
    }
  };
  return <MarkdownDocumentSurface editorHost fontSize={fontSize} documentTheme={writing.documentTheme} className="md-visual-shell" data-md-focus={writing.focusParagraph} data-readonly={readonly}
    onKeyDownCapture={event => {
      if (event.nativeEvent.isComposing) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "f") { event.preventDefault(); event.stopPropagation(); openSearch(); }
      const target = event.target as HTMLElement;
      if (mod && (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y") && target.closest(".ProseMirror")) {
        event.preventDefault(); event.stopPropagation();
        if (!readonly) markdownHistory(event.shiftKey || event.key.toLowerCase() === "y", tabId);
      }
    }}>
    <div className="md-visual-controls">
      <Button size="icon" variant="ghost" title={t("preview.search.placeholder")} pressed={searchOpen} onClick={() => searchOpen ? closeSearch() : openSearch()}><FiSearch /></Button>
      <Button size="icon" variant="ghost" title={t("preview.toc")} pressed={tocOpen} onClick={() => setTocOpen(v => !v)}><FiList /></Button>
    </div>
    {searchOpen && <div className="md-visual-search" role="search" onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeSearch(); }
    }}>
      <input ref={searchInput} className="deditor-input deditor-input--compact" value={query} onChange={e => setQuery(e.target.value)} placeholder={t("preview.search.placeholder")}
        onKeyDown={e => { if (!e.nativeEvent.isComposing && e.key === "Enter") { e.preventDefault(); navigate(e.shiftKey ? -1 : 1); } }} />
      {(["caseSensitive", "wholeWord", "regex"] as const).map(option => <Button key={option} size="sm" pressed={searchOptions[option]} onClick={() => setSearchOptions(value => ({...value, [option]: !value[option]}))}>{t(`md.search.${option}`)}</Button>)}
      {searchError && <span role="alert">{t("md.search.invalidRegex")}</span>}
      <span>{matchCount ? `${matchIndex + 1} / ${matchCount}` : t("preview.search.noMatch")}</span>
      <Button size="icon" title={t("preview.search.prev")} onClick={() => navigate(-1)}><FiChevronLeft /></Button>
      <Button size="icon" title={t("preview.search.next")} onClick={() => navigate(1)}><FiChevronRight /></Button>
      {!readonly && <>
        <input className="deditor-input deditor-input--compact" aria-label={t("md.search.replacement")} placeholder={t("md.search.replacement")} value={replacement} onChange={e => setReplacement(e.target.value)} />
        <Button size="sm" disabled={!matchCount || searchError} onClick={() => replaceMatches(false)}>{t("md.search.replace")}</Button>
        <Button size="sm" disabled={!matchCount || searchError} onClick={() => replaceMatches(true)}>{t("find.replaceAll")}</Button>
      </>}
      <Button size="icon" title={t("preview.search.close")} onClick={closeSearch}><FiX /></Button>
    </div>}
    {error && <div className="deditor-notice" data-tone="error" role="alert">{t("md.visualError")}<Button onClick={() => setLoadAttempt(attempt => attempt + 1)}>{t("md.visualRetry")}</Button><details><summary>{t("md.visualErrorDetails")}</summary>{error}</details><Button onClick={() => useEditorStore.setState({ markdownMode: "source" })}>{t("md.viewEdit")}</Button></div>}
    {!ready && !error && <div className="deditor-notice" role="status">{t("md.visualLoading")}</div>}
    <div className="md-visual-layout">
      <div ref={scroller} className="md-visual-scroll" onScroll={() => { const rt = runtime.current; if (rt && activeRef.current) rt.session.visualScroll = scroller.current?.scrollTop ?? 0; }}>
        <div ref={root} className="md-visual-content" />
      </div>
      {tocOpen && <MarkdownOutline headings={headings} active={activeHeading} navigate={pos => {select(pos); runtime.current?.view.focus();}} />}
    </div>
  </MarkdownDocumentSurface>;
}
