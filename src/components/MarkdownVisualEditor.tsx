import { sharedHeadingIds } from "../lib/markdownVisual/headingIds";
import { installTypewriter } from "../lib/markdownVisual/typewriter";
import { pasteTableClipboard } from "../lib/markdownVisual/tablePaste";
import { inlineSourceSchema, installInlineSource, inlineProjection } from "../lib/markdownVisual/inlineSource";
import { installCompositionViewport } from "../lib/markdownVisual/compositionViewport";
import { installMarkdownComposition } from "../lib/markdownComposition";
import { faithfulLink } from "../lib/markdownVisual/references";
import { absoluteHeadingInputRule } from "../lib/markdownVisual/heading";
import { activeBlockHint } from "../lib/markdownVisual/blockHint";
import { faithfulImage, accessibleImageView } from "../lib/markdownVisual/image";
import { installMarkdownAccessibility, tableIcon } from "../lib/markdownVisual/accessibility";
import { openUrl } from "@tauri-apps/plugin-opener";
import { extendedTableCells } from "../lib/markdownVisual/tableLists";
import { inlineSchemas, faithfulInlineHtml, configureInlineSerialization } from "../lib/markdownVisual/inline";
import { codeView } from "../lib/markdownVisual/codeView";
import { remarkInlineLinkPlugin, remarkPreserveEmptyLinePlugin, syncHeadingIdPlugin, wrapInHeadingInputRule } from "@milkdown/kit/preset/commonmark";
import { useEffect, useRef, useState } from "react";
import { CrepeBuilder } from "@milkdown/crepe/builder";
import { codeMirror } from "@milkdown/crepe/feature/code-mirror";
import { table } from "@milkdown/crepe/feature/table";
import { listItem } from "@milkdown/crepe/feature/list-item";
import { linkTooltip } from "@milkdown/crepe/feature/link-tooltip";
import { imageBlock } from "@milkdown/crepe/feature/image-block";
import { latex } from "@milkdown/crepe/feature/latex";
import { cursor } from "@milkdown/crepe/feature/cursor";
import { editorViewCtx, parserCtx, serializerCtx, editorViewOptionsCtx } from "@milkdown/kit/core";
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
import { dirname, isLocalRef, resolveAgainst, stripFileScheme } from "../lib/pathUtil";
import { saveImage, openFileByPath } from "../lib/fileio";
import { logError } from "../lib/logger";
import { showError } from "../lib/feedback";
import { Button } from "./ui/Button";
import "@milkdown/crepe/theme/common/style.css";
import "./markdown-visual.css";

interface Runtime { session: MarkdownSession; crepe: CrepeBuilder; view: EditorView; document: MarkdownDocument; sync: (source: string) => void; flush: () => void; closeInline: () => void }
export default function MarkdownVisualEditor({ tabId, readonly = false, theme }: { tabId: string; readonly?: boolean; theme: "light" | "dark" }) {
  const t = useT();
  const source = useTabContent(tabId), filePath = useTabFilePath(tabId);
  const language = useEditorStore(s => s.language);
  const writing = useEditorStore(s => s.markdownSettings);
  const fontSize = useEditorStore(s => s.tabs.find(tab => tab.id === tabId)?.zoomFontSize ?? s.editorFontSize);
  const root = useRef<HTMLDivElement>(null), scroller = useRef<HTMLDivElement>(null), searchInput = useRef<HTMLInputElement>(null);
  const runtime = useRef<Runtime | null>(null), readonlyRef = useRef(readonly), sourceRef = useRef(source);
  readonlyRef.current = readonly; sourceRef.current = source;
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false), [searchOpen, setSearchOpen] = useState(false), [query, setQuery] = useState("");
  const [tocOpen, setTocOpen] = useState(false), [headings, setHeadings] = useState<{ pos: number; level: number; text: string }[]>([]);
  const [matchCount, setMatchCount] = useState(0), [matchIndex, setMatchIndex] = useState(0);
  const lastSearch = useRef({ query: "", open: false });
  const matches = useRef<{ from: number; to: number }[]>([]);
  const select = (from: number, to = from) => {
    const view = runtime.current?.view; if (!view) return;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)).scrollIntoView());
  };
  useEffect(() => {
    let cancelled = false, cleanupFlush = () => {}, cleanupInput = () => {}, cleanupAccessibility = () => {}, cleanupCompositionViewport = () => {}, cleanupInlineSource = () => {}, cleanupTypewriter = () => {};
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
      try { const folder = useEditorStore.getState().markdownSettings.imageDirectory; await saveImage(base, name, btoa(binary), folder); return `${folder}/${name}`; }
      catch (err) { logError("Markdown image upload failed", err); void showError(String(err)); throw err; }
    };
    const initialSource = sourceRef.current;
    const crepe = new CrepeBuilder({ root: host, defaultValue: initialSource })
      .addFeature(codeMirror)
      .addFeature(table, {
        addRowIcon: tableIcon(t("md.addRow"), "plus"), addColIcon: tableIcon(t("md.addColumn"), "plus"),
        deleteRowIcon: tableIcon(t("md.deleteRow"), "minus"), deleteColIcon: tableIcon(t("md.deleteColumn"), "minus"),
        alignLeftIcon: tableIcon(t("md.alignLeft"), "left"), alignCenterIcon: tableIcon(t("md.alignCenter"), "center"), alignRightIcon: tableIcon(t("md.alignRight"), "right"),
      }).addFeature(listItem).addFeature(cursor)
      .addFeature(linkTooltip, { inputPlaceholder: t("md.linkUrl") })
      .addFeature(imageBlock, { onUpload: upload,
        proxyDomURL: url => isLocalRef(url) ? convertFileSrc(resolveAgainst(filePath ? dirname(filePath) : "", stripFileScheme(url))) : url,
        inlineUploadButton: t("md.uploadImage"), blockUploadButton: t("md.uploadImage"), blockConfirmButton: t("common.confirm"),
        inlineUploadPlaceholderText: t("md.imageUrlLabel"), blockUploadPlaceholderText: t("md.imageUrlLabel"), blockCaptionPlaceholderText: t("md.imageAltLabel") })
      .addFeature(latex);
    crepe.editor.use(inlineSourceSchema).use(absoluteHeadingInputRule).use(activeBlockHint).use(sharedHeadingIds).use(faithfulLink).use(faithfulInlineHtml).use(faithfulImage).use(extendedTableCells.flat()).use(inlineSchemas.flat()).config(configureInlineSerialization).use(frontmatter).use(rawRemark(mdx)).use(rawSchema);
    crepe.editor.config(ctx => ctx.update(editorViewOptionsCtx, prev => ({ ...prev, attributes: { class: "md-document", "aria-label": t("md.visualEditor"), spellcheck: "false" },
      handleKeyDown: (view, event) => {
        if (event.key !== "Tab" || !view.editable || !isInTable(view.state)) return false;
        event.preventDefault();
        if (goToNextCell(event.shiftKey ? -1 : 1)(view.state, view.dispatch)) return true;
        if (!event.shiftKey && addRowAfter(view.state, view.dispatch)) goToNextCell(1)(view.state, view.dispatch);
        return true;
      },
      handlePaste: pasteTableClipboard,
      handleClick: (view, _pos, event) => {
        const link = (event.target as HTMLElement).closest("a");
        if (!link) return false;
        event.preventDefault();
        const href = link.getAttribute("href") ?? "";
        if (!readonlyRef.current) return true;
        if (href.startsWith("#")) {
          const id = decodeURIComponent(href.slice(1));
          Array.from(view.dom.querySelectorAll<HTMLElement>("[id]")).find(el => el.id === id || el.id === href.slice(1))?.scrollIntoView({ block: "start" });
        } else if (/^(https?:|mailto:)/i.test(href)) void openUrl(href).catch(err => logError("Markdown link open failed", err));
        else if (isLocalRef(href)) void openFileByPath(resolveAgainst(filePath ? dirname(filePath) : "", stripFileScheme(href))).catch(err => logError("Markdown local link open failed", err));
        return true;
      },
    })));
    const initialize = async () => {
      await crepe.editor.remove(history); await crepe.editor.remove(trailing);
      await crepe.editor.remove(wrapInHeadingInputRule);
      await crepe.editor.remove(syncHeadingIdPlugin);
      await crepe.editor.remove(remarkInlineLinkPlugin.plugin);
      await crepe.editor.remove(remarkPreserveEmptyLinePlugin.plugin);
      await crepe.create();
      if (cancelled) { await crepe.destroy(); return; }
      crepe.setReadonly(readonlyRef.current);
      crepe.editor.action(ctx => {
        const view = ctx.get(editorViewCtx), parse = ctx.get(parserCtx), serialize = ctx.get(serializerCtx);
        const document = new MarkdownDocument(initialSource, parse, serialize, mdx, view.state.doc);
        let inlineEditing: ReturnType<typeof installInlineSource> | undefined;
        const publish = () => {
          if (cancelled) return;
          const bridge = visualCommands(view, tabId, parse, () => session.breakGroup());
          const fresh = () => { inlineEditing?.close(); return visualCommands(view, tabId, parse, () => session.breakGroup()); };
          bridge.wrap = (...args) => fresh().wrap(...args);
          bridge.prefix = (...args) => fresh().prefix(...args);
          bridge.insert = (...args) => fresh().insert(...args);
          bridge.color = (...args) => fresh().color(...args);
          bridge.link = (...args) => fresh().link(...args);
          bridge.capture = () => fresh().capture();
          bridge.find = () => setSearchOpen(true);
          bridge.navigate = (line, column = 1) => {
            const lines = document.source.split("\n");
            const offset = lines.slice(0, Math.max(0, line - 1)).reduce((n, text) => n + text.length + 1, 0) + column - 1;
            const pos = document.positionAtSource(offset);
            view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(pos))).scrollIntoView()); view.focus();
          };
          setVisualEditor(bridge);
          session.sourceCursor = document.sourceOffset(view.state.selection.head);
          const store = useEditorStore.getState();
          store.setTabPosition(tabId, { cursor: session.sourceCursor, scrollTopLine: store.tabPositions[tabId]?.scrollTopLine ?? 1 });
          useEditorStore.getState().setActiveSelectionLength(view.state.selection.to - view.state.selection.from);
        };
        const outline = () => {
          const result: { pos: number; level: number; text: string }[] = [];
          view.state.doc.descendants((node, pos) => { if (node.type.name === "heading") result.push({ pos: pos + 1, level: node.attrs.level, text: node.textContent }); });
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
        const originalImageView = view.props.nodeViews?.["image-block"];
        view.setProps({ nodeViews: { ...view.props.nodeViews, ...(originalImageView ? { "image-block": accessibleImageView(originalImageView, language) } : {}), deditor_raw: rawView(filePath, tabId), code_block: codeView(tabId, theme) },
          handleScrollToSelection: () => compositionViewport.handleScroll(),
          dispatchTransaction: tr => {
            if (cancelled) return;
            const result = view.state.applyTransaction(tr);
            view.updateState(result.state);
            const projected = tr.getMeta(inlineProjection);
            if (inlineEditing?.apply(tr)) {
              if (!projected) flush();
            } else if (result.transactions.some(transaction => transaction.docChanged)) flush();
            if (tr.docChanged) outline();
            session.visualSelection = { anchor: view.state.selection.anchor, head: view.state.selection.head };
            publish(); inlineEditing?.update();
            if (!projected && (tr.docChanged || tr.selectionSet)) typewriter.update();
          },
        });
        inlineEditing = installInlineSource(view, document, () => session.breakGroup());
        cleanupInlineSource = inlineEditing.destroy;
        const sync = (content: string) => {
          if (document.source === content) return;
          if (view.composing || composition.composing) return;
          inlineEditing?.reset();
          const next = document.reset(content), selection = view.state.selection;
          const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, next.content);
          tr.setSelection(Selection.near(tr.doc.resolve(Math.min(selection.head, tr.doc.content.size))));
          view.updateState(view.state.apply(tr.setMeta("addToHistory", false))); outline(); publish();
        };
        const beforeInput = (event: Event) => {
          const type = (event as InputEvent).inputType;
          if (type === "historyUndo" || type === "historyRedo") {
            event.preventDefault(); event.stopPropagation();
            if (!readonlyRef.current) markdownHistory(type === "historyRedo", tabId);
          }
        };
        const composition = installMarkdownComposition(view.dom, session, {
          settled: () => {
            if (cancelled) return;
            const live = useEditorStore.getState().tabs.find(tab => tab.id === tabId);
            if (live) sync(live.content);
            publish();
          },
        });
        view.dom.addEventListener("beforeinput", beforeInput, true);
        cleanupInput = () => { composition.destroy(); view.dom.removeEventListener("beforeinput", beforeInput, true); };
        runtime.current = { session, crepe, view, document, sync, flush, closeInline: () => inlineEditing?.close() };
        sync(sourceRef.current);
        const position = Math.min(view.state.doc.content.size, session.sourceCursor === null ? session.visualSelection.head : document.positionAtSource(session.sourceCursor));
        view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(position))));
        if (scroller.current) scroller.current.scrollTop = session.visualScroll;
        cleanupFlush = registerDocumentFlush(tabId, flush);
        cleanupAccessibility = installMarkdownAccessibility(view);
        outline(); publish(); setReady(true);
      });
    };
    void initialize().catch(err => { logError("Markdown visual editor initialization failed", err); if (!cancelled) setError(String(err)); });
    return () => {
      // A path/language/theme remount may follow an external source replacement in the same batch.
      // Never let the outgoing view overwrite the newer store content during cleanup.
      const outgoing = runtime.current;
      if (outgoing && useEditorStore.getState().tabs.find(tab => tab.id === tabId)?.content === outgoing.document.source) outgoing.flush();
      session.breakGroup(); session.visualScroll = scroller.current?.scrollTop ?? session.visualScroll;
      cancelled = true; cleanupFlush(); cleanupInput(); cleanupAccessibility(); cleanupCompositionViewport(); cleanupInlineSource(); cleanupTypewriter(); runtime.current = null;
      if (getVisualEditor()?.tabId === tabId) setVisualEditor(null);
      void crepe.destroy().catch(err => logError("Markdown visual editor cleanup failed", err)); host.remove();
    };
  }, [tabId, filePath, language, theme]);
  useEffect(() => { runtime.current?.sync(source); }, [source]);
  useEffect(() => {
    const rt = runtime.current; if (!rt) return;
    if (readonly) rt.closeInline();
    rt.crepe.setReadonly(readonly);
    rt.view.dom.dispatchEvent(new Event("deditor-editable-change"));
    markdownSession(tabId, sourceRef.current).breakGroup();
    rt.crepe.editor.action(ctx => setVisualEditor({ ...getVisualEditor(), ...visualCommands(rt.view, tabId, ctx.get(parserCtx), () => markdownSession(tabId, sourceRef.current).breakGroup()) }));
  }, [readonly, ready, tabId]);
  useEffect(() => { if (searchOpen) searchInput.current?.focus(); }, [searchOpen]);
  useEffect(() => {
    const found: { from: number; to: number }[] = [];
    if (query && runtime.current) runtime.current.view.state.doc.descendants((node, pos) => {
      if (!node.isTextblock) return;
      // Include adjoining text marks while keeping positions aligned around inline atoms.
      const text = node.textBetween(0, node.content.size, "", "\ufffc").toLocaleLowerCase(), search = query.toLocaleLowerCase();
      for (let index = text.indexOf(search); index >= 0; index = text.indexOf(search, index + search.length)) found.push({ from: pos + 1 + index, to: pos + 1 + index + search.length });
      return false;
    });
    // Recompute results after edits, but only user search actions may move the caret.
    // A retained query must never reselect/overwrite a distant match while typing.
    const requested = searchOpen && (!lastSearch.current.open || lastSearch.current.query !== query);
    lastSearch.current = { query, open: searchOpen };
    matches.current = found; setMatchCount(found.length);
    if (requested) {
      setMatchIndex(0);
      if (found[0]) select(found[0].from, found[0].to);
    } else setMatchIndex(index => Math.min(index, Math.max(0, found.length - 1)));
  }, [query, source, ready, searchOpen]);
  const navigate = (delta: number) => {
    if (!matches.current.length) return;
    const index = (matchIndex + delta + matches.current.length) % matches.current.length;
    setMatchIndex(index); const match = matches.current[index]; select(match.from, match.to);
  };
  return <section className="md-visual-shell" data-md-theme={writing.documentTheme} data-md-focus={writing.focusParagraph} data-readonly={readonly} style={{ "--md-visual-font-size": `${fontSize}px`, "--md-document-zoom": `${fontSize - 14}px` } as React.CSSProperties}
    onKeyDownCapture={event => {
      if (event.nativeEvent.isComposing) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "f") { event.preventDefault(); event.stopPropagation(); setSearchOpen(true); }
      const target = event.target as HTMLElement;
      if (mod && (event.key.toLowerCase() === "z" || event.key.toLowerCase() === "y") && target.closest(".ProseMirror")) {
        event.preventDefault(); event.stopPropagation();
        if (!readonly) markdownHistory(event.shiftKey || event.key.toLowerCase() === "y", tabId);
      }
    }}>
    <div className="md-visual-controls">
      <Button size="icon" variant="ghost" title={t("preview.search.placeholder")} pressed={searchOpen} onClick={() => setSearchOpen(v => !v)}><FiSearch /></Button>
      <Button size="icon" variant="ghost" title={t("preview.toc")} pressed={tocOpen} onClick={() => setTocOpen(v => !v)}><FiList /></Button>
    </div>
    {searchOpen && <div className="md-visual-search" role="search">
      <input ref={searchInput} className="deditor-input deditor-input--compact" value={query} onChange={e => setQuery(e.target.value)} placeholder={t("preview.search.placeholder")}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); navigate(e.shiftKey ? -1 : 1); } if (e.key === "Escape") { setSearchOpen(false); runtime.current?.view.focus(); } }} />
      <span>{matchCount ? `${matchIndex + 1} / ${matchCount}` : t("preview.search.noMatch")}</span>
      <Button size="icon" title={t("preview.search.prev")} onClick={() => navigate(-1)}><FiChevronLeft /></Button>
      <Button size="icon" title={t("preview.search.next")} onClick={() => navigate(1)}><FiChevronRight /></Button>
      <Button size="icon" title={t("preview.search.close")} onClick={() => setSearchOpen(false)}><FiX /></Button>
    </div>}
    {error && <div className="deditor-notice" data-tone="error" role="alert">{t("md.visualError")} {error}<Button onClick={() => useEditorStore.setState({ markdownMode: "source" })}>{t("md.viewEdit")}</Button></div>}
    {!ready && !error && <div className="deditor-notice" role="status">{t("md.visualLoading")}</div>}
    <div className="md-visual-layout">
      <div ref={scroller} className="md-visual-scroll" onScroll={() => { const rt = runtime.current; if (rt) rt.session.visualScroll = scroller.current?.scrollTop ?? 0; }}>
        <div ref={root} className="md-visual-content" />
      </div>
      {tocOpen && <nav className="md-visual-toc" aria-label={t("preview.toc")}>
        {headings.map(h => <Button key={h.pos} variant="ghost" size="sm" style={{ paddingLeft: `${8 + (h.level - 1) * 10}px` }} onClick={() => { select(h.pos); runtime.current?.view.focus(); }}>{h.text}</Button>)}
        {!headings.length && <span>{t("preview.tocEmpty")}</span>}
      </nav>}
    </div>
  </section>;
}
