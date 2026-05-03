import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { EditorState, EditorSelection, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  rectangularSelection,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightWhitespace,
} from "@codemirror/view";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { showMinimap as showMinimapFacet } from "@replit/codemirror-minimap";
import type { Command } from "@codemirror/view";
import { copyLineDown, defaultKeymap, history, historyField, historyKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches, selectSelectionMatches, openSearchPanel } from "@codemirror/search";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { markdownTableKeymap } from "../lib/markdownTable";
import { colorPreview } from "../lib/colorPreview";
import { inspectionMarkers } from "../lib/inspectionMarkers";
import { refreshVcsForView, vcsExtensions } from "../lib/vcsGutter";
import { workspaceOf } from "../lib/git";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  indentOnInput,
  bracketMatching,
  foldGutter,
  foldKeymap,
  LanguageSupport,
} from "@codemirror/language";
import { islandDark } from "../lib/islandDarkTheme";
import { islandLight } from "../lib/islandLightTheme";
import { detectLang, isMarkdown, isImageFile, isPdfFile, isAudioFile, isVideoFile, isHexFile, isXmindFile } from "../lib/lang";
import { useEditorStore, type DiffSpec } from "../store/editor";
// Lazy-loaded: each pulls a heavy dep tree (jsdiff for DiffView, mind-elixir
// for XmindView, the entire LogPanel + per-commit panels). Default Editor
// path renders code/text — never needs these. Splitting them off saves
// ~500KB raw / ~150KB gz from the cold-start chunk.
const DiffView = lazy(() => import("./DiffView"));
const LogPanel = lazy(() => import("./LogPanel"));
const XmindView = lazy(() => import("./XmindView"));
import type { LogSpec } from "../store/editor";
import { invoke } from "@tauri-apps/api/core";
import { isEnabled } from "../lib/shortcuts";
import {
  bookmarkExtension,
  toggleBookmark,
  nextBookmark,
  prevBookmark,
  clearBookmarks,
} from "../lib/bookmarks";
import { saveImage } from "../lib/fileio";
// Lazy: HTML / PDF export pulls markdown-it + Shiki. Loaded only when the
// user picks "Export HTML" / "Export PDF" from the right-click menu.
const exportHtml = () => import("../lib/export").then((m) => m.exportHtml());
const exportPdf = () => import("../lib/export").then((m) => m.exportPdf());
import { codeBlockCompletion } from "../lib/codeBlockComplete";
import { logError, logInfo } from "../lib/logger";
import { setActiveView } from "../lib/editorBridge";
import { pushStatusInfo as statusInfoPush, detectEol } from "../lib/statusInfo";
import { tStatic, useT } from "../lib/i18n";
import ContextMenu, { type MenuItem } from "./ContextMenu";

const addCursorVertical = (dir: -1 | 1): Command => (view) => {
  const { state, dispatch } = view;
  const newRanges = state.selection.ranges.slice();
  let added = false;
  for (const r of state.selection.ranges) {
    const line = state.doc.lineAt(r.head);
    const targetNo = line.number + dir;
    if (targetNo < 1 || targetNo > state.doc.lines) continue;
    const target = state.doc.line(targetNo);
    const col = r.head - line.from;
    const pos = target.from + Math.min(col, target.length);
    newRanges.push(EditorSelection.cursor(pos));
    added = true;
  }
  if (!added) return false;
  dispatch({
    selection: EditorSelection.create(newRanges),
    scrollIntoView: true,
  });
  return true;
};

/** True if the file's extension is one where color literals (#rgb, rgb(...))
 *  naturally appear, so the color-swatch ViewPlugin should be enabled. */
const COLOR_PREVIEW_EXT = new Set([
  ".css", ".scss", ".sass", ".less", ".styl",
  ".html", ".htm", ".vue", ".svelte",
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
  ".md", ".mdx", ".markdown",
  ".json", ".jsonc", ".yaml", ".yml",
]);
function colorPreviewSupported(filePath: string | null): boolean {
  if (!filePath) return false;
  const dot = filePath.lastIndexOf(".");
  if (dot < 0) return false;
  return COLOR_PREVIEW_EXT.has(filePath.slice(dot).toLowerCase());
}

interface Props {
  value: string;
  filePath: string | null;
  theme: "light" | "dark";
  fontSize: number;
  /** Whether this Editor is the user-visible (active) one. Multiple Editors
   *  can be mounted in EditorHost (one per visited tab); only the active one
   *  should drive shared status/EditorBridge state. Defaults to true so the
   *  split-editor and other single-instance callers work without passing it. */
  active?: boolean;
  /** Active tab id. Used to look up / save the per-tab CodeMirror state JSON
   *  so undo/redo history survives switching to another tab and back. */
  tabId?: string;
  /** When true, skip the per-tab state cache entirely. Used by the secondary
   *  Editor in split-view so it doesn't collide with the primary on cache
   *  reads/writes. Trade-off: secondary view's undo doesn't carry across
   *  tab switches. */
  noStateCache?: boolean;
  /** When set, the active tab is a side-by-side file comparison; we short-
   *  circuit and render DiffView, ignoring CodeMirror entirely. */
  diff?: DiffSpec;
  /** When set, the tab renders the Git Log panel for this workspace. Same
   *  short-circuit pattern as `diff` — CodeMirror never mounts. */
  log?: LogSpec;
  /** Caret offset to restore on mount (only read once, when this Editor mounts). */
  initialCursor?: number;
  /** First-visible line (1-based) to restore on mount. */
  initialScrollLine?: number;
  /** External scroll line (driven by preview); will scroll editor to that line. */
  externalScrollLine?: number;
  onChange: (value: string) => void;
  onScroll?: (firstVisibleLine: number) => void;
  onPositionChange?: (pos: { cursor: number; scrollTopLine: number }) => void;
}

/** Per-tab CodeMirror state cache — keyed by the tab id passed in via props.
 *  Module-scoped so it survives Editor remounts (App.tsx remounts Editor on
 *  every tab switch via `key={tab.id}`). We serialize the EditorState as
 *  JSON, including the history field, so undo/redo carries across switches.
 *
 *  Lives only for the current process — not persisted to disk. Sublime is
 *  the same: undo doesn't survive app restart. */
const editorStateCache = new Map<string, unknown>();

/** Drop the cache entry for a tab that's been closed so the map doesn't
 *  grow forever as the user opens many short-lived tabs. */
export function dropEditorStateCache(tabId: string): void {
  editorStateCache.delete(tabId);
}

export default function Editor({
  value,
  filePath,
  theme,
  fontSize,
  active = true,
  tabId,
  noStateCache,
  diff,
  log,
  initialCursor,
  initialScrollLine,
  externalScrollLine,
  onChange,
  onScroll,
  onPositionChange,
}: Props) {
  const t = useT();
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  // Diff tab — render the side-by-side comparison.
  if (diff) {
    return (
      <Suspense fallback={<LazyFallback />}>
        <DiffView spec={diff} />
      </Suspense>
    );
  }
  // Log tab — render the Git Log panel.
  if (log) {
    return (
      <Suspense fallback={<LazyFallback />}>
        <LogPanel workspace={log.workspace} initialPath={log.initialPath} />
      </Suspense>
    );
  }
  // Image preview — render a data URL directly as <img>.
  if (isImageFile(filePath) && value.startsWith("data:")) {
    return (
      <div className="flex items-center justify-center h-full w-full overflow-auto p-4">
        <img src={value} alt={filePath ?? "image"} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
      </div>
    );
  }
  // PDF preview — let the webview's native viewer render the data URL.
  if (isPdfFile(filePath) && value.startsWith("data:application/pdf")) {
    return <PdfView src={value} title={filePath ?? "pdf"} />;
  }
  // Audio / video — render with the native HTML5 element.
  if (isAudioFile(filePath) && value.startsWith("data:audio")) {
    return (
      <div className="flex items-center justify-center h-full w-full p-4">
        <audio src={value} controls style={{ width: "100%", maxWidth: 640 }} />
      </div>
    );
  }
  if (isVideoFile(filePath) && value.startsWith("data:video")) {
    return (
      <div className="flex items-center justify-center h-full w-full overflow-auto p-4" style={{ background: "var(--bg)" }}>
        <video src={value} controls style={{ maxWidth: "100%", maxHeight: "100%" }} />
      </div>
    );
  }
  // XMind workbook — read-only viewer (and mind-elixir-backed editor).
  if (isXmindFile(filePath) && value.startsWith("data:")) {
    return (
      <Suspense fallback={<LazyFallback />}>
        <XmindView dataUrl={value} filePath={filePath} tabId={tabId} />
      </Suspense>
    );
  }
  // Binary files we don't have a preview for (Office docs, archives, executables,
  // etc.) — render a hex dump so the user at least sees the raw bytes instead
  // of UTF-8-decoded garbage.
  if (isHexFile(filePath) && value.startsWith("data:")) {
    return <HexView dataUrl={value} filePath={filePath} />;
  }
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const langCompartment = useRef(new Compartment());
  const wrapCompartment = useRef(new Compartment());
  const indentCompartment = useRef(new Compartment());
  const whitespaceCompartment = useRef(new Compartment());
  const minimapCompartment = useRef(new Compartment());
  const completionCompartment = useRef(new Compartment());
  const autoCloseCompartment = useRef(new Compartment());
  // Compartments for "decorations not on the critical paint path".
  // Mounted empty; reconfigured to their real contents in the next animation
  // frame so the editor paints first and these layers fade in milliseconds
  // later. Each is a moderate cost: minimap measures the doc, color/inspection
  // walk visible lines for swatches/markers, codeBlockCompletion sets up
  // autocomplete state.
  const colorPreviewCompartment = useRef(new Compartment());
  const inspectionCompartment = useRef(new Compartment());
  const softWrap = useEditorStore((s) => s.softWrap);
  const showIndentGuides = useEditorStore((s) => s.showIndentGuides);
  const showWhitespace = useEditorStore((s) => s.showWhitespace);
  const showMinimap = useEditorStore((s) => s.showMinimap);
  const autoCloseBrackets = useEditorStore((s) => s.autoCloseBrackets);
  const onChangeRef = useRef(onChange);
  const onScrollRef = useRef(onScroll);
  const onPositionChangeRef = useRef(onPositionChange);
  // Suppress outgoing scroll events for this many ms after a programmatic scroll,
  // to prevent the editor⇄preview sync from echoing back and forth.
  const suppressOutgoingUntil = useRef(0);
  // Latest known view position; flushed to onPositionChange on a debounce.
  const positionRef = useRef({
    cursor: Math.max(0, initialCursor ?? 0),
    scrollTopLine: Math.max(1, initialScrollLine ?? 1),
  });
  const positionFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set to `true` whenever this Editor's own updateListener emits a docChange
  // (i.e., the user typed). The next [value] effect tick is then expected
  // to receive that same content back from the parent (because setContent
  // round-trips through the store). We skip the doc.toString() compare in
  // that case — for a multi-MB doc that toString is the most expensive thing
  // on the keystroke path.
  const valueEcho = useRef(false);
  onChangeRef.current = onChange;
  onScrollRef.current = onScroll;
  onPositionChangeRef.current = onPositionChange;

  const schedulePositionFlush = () => {
    if (positionFlushTimer.current) return;
    positionFlushTimer.current = setTimeout(() => {
      positionFlushTimer.current = null;
      onPositionChangeRef.current?.({ ...positionRef.current });
    }, 200);
  };

  useEffect(() => {
    if (!hostRef.current) return;

    const clampedInitialCursor =
      initialCursor != null
        ? Math.max(0, Math.min(initialCursor, value.length))
        : undefined;
    const extensions = [
        lineNumbers(),
        foldGutter(),
        highlightActiveLine(),
        history(),
        indentOnInput(),
        bracketMatching(),
        highlightSelectionMatches(),
        EditorState.allowMultipleSelections.of(true),
        // drawSelection is required for multi-range / column selections to actually render —
        // native browser selection can only paint one contiguous range.
        drawSelection(),
        dropCursor(),
        // Sublime-style: Cmd/Ctrl+Click adds a cursor; Alt+Drag does column selection.
        EditorView.clickAddsSelectionRange.of((e) => e.metaKey || e.ctrlKey),
        rectangularSelection(),
        crosshairCursor(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        // Custom keymap entries respect the user's per-shortcut prefs from
        // Settings. Read lazily via the store so a `run` invocation always
        // sees the latest toggle without us rebuilding the keymap. Returning
        // false from `run` falls through to whatever else is bound — same as
        // not registering the key at all from CodeMirror's perspective.
        keymap.of([
          {
            key: "Mod-Alt-ArrowUp",
            run: (view) =>
              isEnabled(useEditorStore.getState().shortcuts, "editor_add_cursor_above")
                ? addCursorVertical(-1)(view)
                : false,
          },
          {
            key: "Mod-Alt-ArrowDown",
            run: (view) =>
              isEnabled(useEditorStore.getState().shortcuts, "editor_add_cursor_below")
                ? addCursorVertical(1)(view)
                : false,
          },
          {
            key: "Mod-Shift-l",
            run: (view) =>
              isEnabled(useEditorStore.getState().shortcuts, "editor_select_all_matches")
                ? selectSelectionMatches(view)
                : false,
          },
          // Bookmarks: F2 toggle / F8 next / Shift+F8 prev / Cmd+Shift+F2 clear.
          { key: "F2", run: toggleBookmark, preventDefault: true },
          { key: "F8", run: nextBookmark, preventDefault: true },
          { key: "Shift-F8", run: prevBookmark, preventDefault: true },
          { key: "Mod-Shift-F2", run: clearBookmarks, preventDefault: true },
          // Sublime-style duplicate line. defaultKeymap already binds
          // Shift-Alt-Down → copyLineDown, but Cmd+Shift+D is the muscle
          // memory most users come in with.
          { key: "Mod-Shift-d", run: copyLineDown, preventDefault: true },
          // Markdown-only: Tab/Shift-Tab navigate between table cells. The
          // handlers return false outside tables so the default Tab (indent)
          // continues to work in code/prose. Gated on `isMarkdown(filePath)`
          // to avoid the negligible cost on non-Markdown files entirely.
          ...(isMarkdown(filePath) ? markdownTableKeymap : []),
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          ...foldKeymap,
          indentWithTab,
        ]),
        wrapCompartment.current.of(softWrap ? EditorView.lineWrapping : []),
        indentCompartment.current.of(showIndentGuides ? indentationMarkers() : []),
        whitespaceCompartment.current.of(showWhitespace ? highlightWhitespace() : []),
        // Mount eagerly: minimap and inspectionMarkers add sidebar columns,
        // so deferring them caused the editor width to snap narrower one
        // frame after first paint — visible flicker when the user clicks
        // through several files quickly. Pay the small init cost upfront
        // for a stable layout.
        minimapCompartment.current.of(showMinimap ? buildMinimap() : []),
        autoCloseCompartment.current.of(autoCloseBrackets ? closeBrackets() : []),
        // Defer: codeBlockCompletion installs autocomplete state, which is
        // moderate work and irrelevant until the user types ` ``` `.
        completionCompartment.current.of([]),
        // Defer only inline decorations that don't affect layout:
        // colorPreview adds widgets *inside* lines (no width change). The
        // inspection strip was moved back to eager init because it's a
        // sidebar element.
        colorPreviewCompartment.current.of([]),
        inspectionCompartment.current.of(inspectionMarkers()),
        bookmarkExtension(),
        vcsExtensions(),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            valueEcho.current = true;
            onChangeRef.current(u.state.doc.toString());
          }
          if (u.selectionSet || u.docChanged) {
            positionRef.current.cursor = u.state.selection.main.head;
            schedulePositionFlush();
            // Update the StatusBar's selection-length readout. Sum every
            // range so multi-cursor selections still report a useful total.
            let selLen = 0;
            for (const r of u.state.selection.ranges) selLen += r.to - r.from;
            useEditorStore.getState().setActiveSelectionLength(selLen);
          }
          // StatusBar info — push line/col + totals from CodeMirror's own
          // O(log n) line index so the status bar doesn't re-scan the doc on
          // every keystroke. Push happens on every relevant update; the
          // statusInfo store has its own change-detector, so unchanged
          // values don't broadcast.
          if (u.selectionSet || u.docChanged) {
            const head = u.state.selection.main.head;
            const lineObj = u.state.doc.lineAt(head);
            statusInfoPush({
              line: lineObj.number,
              col: head - lineObj.from + 1,
              totalLines: u.state.doc.lines,
              charCount: u.state.doc.length,
            });
          }
        }),
        themeCompartment.current.of(theme === "dark" ? islandDark : islandLight),
        langCompartment.current.of([]),
        EditorView.domEventHandlers({
          paste: (e, view) => {
            const items = e.clipboardData?.items;
            if (!items) return false;
            for (const item of items) {
              if (item.type.startsWith("image/")) {
                const blob = item.getAsFile();
                if (!blob) continue;
                e.preventDefault();
                handleImagePaste(blob, item.type, view);
                return true;
              }
            }
            return false;
          },
          contextmenu: (e) => {
            // Replace the OS-native context menu (which follows OS locale)
            // with our own so it tracks the in-app i18n.
            e.preventDefault();
            setCtxMenu({ x: e.clientX, y: e.clientY });
            return true;
          },
        }),
      ];

    // Try to restore from the per-tab JSON cache (preserves undo/redo across
    // tab switches). If the cached doc no longer matches the current `value`
    // (e.g. file was reloaded externally), bail and start fresh — restoring
    // a stale doc would let the user "undo" into content that doesn't exist
    // on disk anymore.
    const cachedJSON = tabId && !noStateCache ? editorStateCache.get(tabId) : undefined;
    let state: EditorState;
    if (cachedJSON && (cachedJSON as { doc?: string }).doc === value) {
      try {
        state = EditorState.fromJSON(
          cachedJSON,
          { extensions },
          { history: historyField },
        );
      } catch {
        state = EditorState.create({
          doc: value,
          selection:
            clampedInitialCursor != null
              ? EditorSelection.cursor(clampedInitialCursor)
              : undefined,
          extensions,
        });
      }
    } else {
      state = EditorState.create({
        doc: value,
        selection:
          clampedInitialCursor != null
            ? EditorSelection.cursor(clampedInitialCursor)
            : undefined,
        extensions,
      });
    }

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    setActiveView(view);

    // Stage 2 of mount: enhance the editor with the inline-only decorations
    // (color swatches inside lines, autocomplete state) once it has painted.
    // Layout-affecting things (minimap, inspectionMarkers — both sidebar
    // columns) mount eagerly so the editor width is correct from the very
    // first frame; deferring them caused a one-frame width snap that read
    // as flicker when the user clicked through files quickly.
    const enhanceHandle = requestAnimationFrame(() => {
      if (viewRef.current !== view) return;
      view.dispatch({
        effects: [
          completionCompartment.current.reconfigure(
            isMarkdown(filePath) ? codeBlockCompletion() : [],
          ),
          colorPreviewCompartment.current.reconfigure(
            colorPreviewSupported(filePath) ? colorPreview() : [],
          ),
        ],
      });
    });

    // Restore first-visible line. Defer to next frame so CM has measured layout.
    if (initialScrollLine != null && initialScrollLine > 1) {
      const target = initialScrollLine;
      requestAnimationFrame(() => {
        if (viewRef.current !== view) return;
        try {
          const total = view.state.doc.lines;
          const lineNum = Math.min(Math.max(1, Math.round(target)), total);
          const line = view.state.doc.line(lineNum);
          const block = view.lineBlockAt(line.from);
          suppressOutgoingUntil.current = Date.now() + 200;
          view.scrollDOM.scrollTop = block.top;
        } catch {
          /* doc shorter than expected, or layout not ready */
        }
      });
    }

    // Direct scroll-event listener for smooth, every-frame outgoing sync.
    let scrollRafId = 0;
    const onScrollEvt = () => {
      if (scrollRafId) return;
      scrollRafId = requestAnimationFrame(() => {
        scrollRafId = 0;
        const top = view.scrollDOM.scrollTop;
        try {
          const block = view.lineBlockAtHeight(top);
          const line = view.state.doc.lineAt(block.from).number;
          // Always track for persistence — even programmatic scrolls reflect
          // the user's last viewing position.
          positionRef.current.scrollTopLine = line;
          schedulePositionFlush();
          // But don't echo programmatic scrolls back through editor⇄preview sync.
          if (Date.now() >= suppressOutgoingUntil.current) {
            onScrollRef.current?.(line);
          }
        } catch {
          /* during destroy / odd states; ignore */
        }
      });
    };
    view.scrollDOM.addEventListener("scroll", onScrollEvt, { passive: true });

    return () => {
      view.scrollDOM.removeEventListener("scroll", onScrollEvt);
      if (scrollRafId) cancelAnimationFrame(scrollRafId);
      cancelAnimationFrame(enhanceHandle);
      // Final flush so the very last position isn't lost on tab switch / unmount.
      if (positionFlushTimer.current) {
        clearTimeout(positionFlushTimer.current);
        positionFlushTimer.current = null;
      }
      onPositionChangeRef.current?.({ ...positionRef.current });
      // Stash state JSON (incl. undo history) for next mount of the same tab.
      if (tabId && !noStateCache) {
        try {
          editorStateCache.set(
            tabId,
            view.state.toJSON({ history: historyField }),
          );
        } catch {
          /* defensive: never block unmount on a serialization error */
        }
      }
      view.destroy();
      viewRef.current = null;
      setActiveView(null);
      // Clear the StatusBar readout so a closed editor's last selection
      // count doesn't linger over the next tab.
      useEditorStore.getState().setActiveSelectionLength(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply external scroll requests (e.g. from preview).
  useEffect(() => {
    if (externalScrollLine == null) return;
    const view = viewRef.current;
    if (!view) return;
    const total = view.state.doc.lines;
    const lineNum = Math.min(Math.max(1, Math.round(externalScrollLine)), total);
    try {
      const line = view.state.doc.line(lineNum);
      const block = view.lineBlockAt(line.from);
      suppressOutgoingUntil.current = Date.now() + 200;
      view.scrollDOM.scrollTop = block.top;
    } catch {
      /* doc shorter than expected */
    }
  }, [externalScrollLine]);

  useEffect(() => {
    // Echo of our own updateListener-driven setContent → store → prop loop.
    // Skip the (potentially-MB-allocating) doc.toString() comparison and
    // bail. External-origin changes (autosave reload, file watch, etc.)
    // bypass this guard because they don't go through CodeMirror first.
    if (valueEcho.current) {
      valueEcho.current = false;
      return;
    }
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.current.reconfigure(
        theme === "dark" ? islandDark : islandLight,
      ),
    });
  }, [theme]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapCompartment.current.reconfigure(
        softWrap ? EditorView.lineWrapping : [],
      ),
    });
  }, [softWrap]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: indentCompartment.current.reconfigure(
        showIndentGuides ? indentationMarkers() : [],
      ),
    });
  }, [showIndentGuides]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: whitespaceCompartment.current.reconfigure(
        showWhitespace ? highlightWhitespace() : [],
      ),
    });
  }, [showWhitespace]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: minimapCompartment.current.reconfigure(
        showMinimap ? buildMinimap() : [],
      ),
    });
  }, [showMinimap]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: autoCloseCompartment.current.reconfigure(
        autoCloseBrackets ? closeBrackets() : [],
      ),
    });
  }, [autoCloseBrackets]);

  // Push initial status info whenever this Editor becomes the active one
  // (so the StatusBar updates instantly on tab switch instead of waiting
  // for the next user keystroke). Also runs once on mount of the active
  // editor. Reads from the live view, so the values match exactly.
  useEffect(() => {
    if (!active) return;
    const view = viewRef.current;
    if (!view) return;
    const head = view.state.selection.main.head;
    const lineObj = view.state.doc.lineAt(head);
    statusInfoPush({
      line: lineObj.number,
      col: head - lineObj.from + 1,
      totalLines: view.state.doc.lines,
      charCount: view.state.doc.length,
    });
  }, [active]);

  // EOL: detected once per file load / save, not per keystroke. The CRLF /
  // LF distinction comes from the on-disk content, which only updates here
  // when `value` changes from outside (file load, save, external reload).
  useEffect(() => {
    if (!active) return;
    statusInfoPush({ eol: detectEol(value) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, filePath]);

  useEffect(() => {
    let cancelled = false;
    const def = detectLang(filePath);
    def
      .cm()
      .then((support: LanguageSupport) => {
        if (cancelled || !viewRef.current) return;
        viewRef.current.dispatch({
          effects: langCompartment.current.reconfigure(support),
        });
        logInfo(`lang set: ${def.label} for ${filePath ?? "(no path)"}`);
      })
      .catch((err) => {
        logError(`load language failed for ${filePath ?? "(no path)"}`, err);
        if (!viewRef.current) return;
        viewRef.current.dispatch({
          effects: langCompartment.current.reconfigure([]),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: completionCompartment.current.reconfigure(
        isMarkdown(filePath) ? codeBlockCompletion() : [],
      ),
    });
  }, [filePath]);

  // VCS gutter + inline blame — refresh on file path change AND when the
  // file is saved (or externally reloaded). Triggering on `value` instead
  // would re-arm this on every keystroke; using `savedContent` matches the
  // actual cadence at which hunks-vs-HEAD becomes meaningful to refresh.
  const gutterEnabled = useEditorStore((s) => s.gutterMarkers);
  const blameEnabled = useEditorStore((s) => s.inlineBlame);
  const savedContent = useEditorStore((s) =>
    tabId ? s.tabs.find((t) => t.id === tabId)?.savedContent : undefined,
  );
  useEffect(() => {
    if (!viewRef.current || !filePath) return;
    const workspaces = useEditorStore.getState().workspaces;
    const ws = workspaceOf(filePath, workspaces);
    if (!ws) return;
    // Defer the two git CLI subprocess invokes (blame + diff) until the
    // browser has a moment of idle. The editor renders + paints the file
    // first; markers fade in milliseconds later. Fallback to setTimeout
    // when requestIdleCallback isn't available (Safari < 16).
    let cancelled = false;
    const run = () => {
      if (cancelled || !viewRef.current) return;
      void refreshVcsForView(viewRef.current, ws, filePath, {
        gutterEnabled,
        blameEnabled,
      });
    };
    type IdleCb = (cb: IdleRequestCallback, opts?: { timeout: number }) => number;
    const ric = (window as unknown as { requestIdleCallback?: IdleCb })
      .requestIdleCallback;
    const handle: number = ric
      ? ric(run, { timeout: 500 })
      : window.setTimeout(run, 80);
    return () => {
      cancelled = true;
      const cic = (
        window as unknown as { cancelIdleCallback?: (h: number) => void }
      ).cancelIdleCallback;
      if (ric && cic) cic(handle);
      else window.clearTimeout(handle);
    };
  }, [filePath, gutterEnabled, blameEnabled, savedContent]);

  const buildCtxItems = (): MenuItem[] => {
    const view = viewRef.current;
    const sel = view?.state.selection.main;
    const hasSelection = !!sel && sel.from !== sel.to;
    const items: MenuItem[] = [
      {
        label: t("editor.cut"),
        disabled: !hasSelection,
        onClick: () => view && doCut(view),
      },
      {
        label: t("editor.copy"),
        disabled: !hasSelection,
        onClick: () => view && doCopy(view),
      },
      {
        label: t("editor.paste"),
        onClick: () => view && doPaste(view),
      },
      { divider: true },
      {
        label: t("editor.selectAll"),
        onClick: () => view && doSelectAll(view),
      },
      { divider: true },
      {
        label: t("editor.find"),
        onClick: () => view && openSearchPanel(view),
      },
    ];
    if (filePath && hasSelection && view) {
      const workspaces = useEditorStore.getState().workspaces;
      const ws = workspaceOf(filePath, workspaces);
      if (ws) {
        const startLine = view.state.doc.lineAt(sel!.from).number;
        const endLine = view.state.doc.lineAt(sel!.to).number;
        items.push({ divider: true });
        items.push({
          label: t("gitMenu.showLineHistory"),
          onClick: async () => {
            try {
              const out = await invoke<string>("git_line_history", {
                workspace: ws,
                path: filePath,
                start: startLine,
                end: endLine,
              });
              useEditorStore.getState().openDiffTab({
                leftPath: `line-history:${startLine}-${endLine}`,
                rightPath: filePath,
                leftContent: "",
                rightContent: out,
              });
            } catch (e) {
              // eslint-disable-next-line no-alert
              alert(String(e));
            }
          },
        });
      }
    }
    if (isMarkdown(filePath)) {
      const { showPreview, togglePreview } = useEditorStore.getState();
      items.push({ divider: true });
      items.push({
        label: showPreview ? t("tabbar.hidePreview") : t("tabbar.showPreview"),
        onClick: () => togglePreview(),
      });
      items.push({ label: t("titlebar.exportHtml"), onClick: () => void exportHtml() });
      items.push({ label: t("titlebar.exportPdf"), onClick: () => void exportPdf() });
    }
    return items;
  };

  return (
    <>
      <div className="relative h-full w-full">
        <div
          ref={hostRef}
          className="h-full w-full overflow-hidden"
          style={{ ["--editor-font-size" as string]: `${fontSize}px` }}
        />
        <InspectionsBadge value={value} filePath={filePath} />
      </div>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={buildCtxItems()}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </>
  );
}

/** IntelliJ-style inspections widget in the editor's top-right corner. We
 *  don't ship a real linter so we surface document stats instead — line/char
 *  counts always, plus an estimated read time for Markdown. Pure decorative
 *  pill; click target reserved for future "jump to next problem" wiring. */
function InspectionsBadge({
  value,
  filePath,
}: {
  value: string;
  filePath: string | null;
}) {
  // data: URLs are binary content (image / pdf / hex), the badge is meaningless.
  if (value.startsWith("data:")) return null;
  const lines = value === "" ? 0 : value.split("\n").length;
  const chars = value.length;
  // Markdown read-time: 300 cn-chars/min OR 200 en-words/min, whichever larger.
  let readMin = 0;
  if (isMarkdown(filePath)) {
    const cjk = (value.match(/[一-鿿]/g) ?? []).length;
    const words = value.split(/\s+/).filter(Boolean).length;
    readMin = Math.max(1, Math.round(Math.max(cjk / 300, words / 200)));
  }
  return (
    <div
      style={{
        position: "absolute",
        top: 6,
        right: 14,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 10px",
        fontSize: 11,
        color: "var(--text-soft)",
        background: "color-mix(in srgb, var(--bg-soft) 85%, transparent)",
        border: "1px solid var(--border)",
        borderRadius: 999,
        backdropFilter: "blur(6px)",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <span className="tabular-nums">{lines.toLocaleString()} 行</span>
      <span style={{ opacity: 0.5 }}>·</span>
      <span className="tabular-nums">{chars.toLocaleString()} 字</span>
      {readMin > 0 && (
        <>
          <span style={{ opacity: 0.5 }}>·</span>
          <span className="tabular-nums">~{readMin} min</span>
        </>
      )}
    </div>
  );
}

async function doCopy(view: EditorView) {
  const { from, to } = view.state.selection.main;
  if (from === to) return;
  const text = view.state.sliceDoc(from, to);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard denied; nothing more we can do here */
  }
}

async function doCut(view: EditorView) {
  const { from, to } = view.state.selection.main;
  if (from === to) return;
  const text = view.state.sliceDoc(from, to);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* fall through */
  }
  view.dispatch({ changes: { from, to, insert: "" } });
  view.focus();
}

async function doPaste(view: EditorView) {
  let text: string;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    return;
  }
  if (!text) return;
  const { from, to } = view.state.selection.main;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
  });
  view.focus();
}

function doSelectAll(view: EditorView) {
  view.dispatch({
    selection: { anchor: 0, head: view.state.doc.length },
  });
  view.focus();
}

async function handleImagePaste(blob: File, mime: string, view: EditorView) {
  const { workspaces, tabs, activeId } = useEditorStore.getState();
  const active = tabs.find((t) => t.id === activeId) ?? null;
  const filePath = active?.filePath ?? null;
  let baseDir: string | null = null;
  if (filePath) {
    // Prefer the file's own directory (assets sit beside the doc)
    const idx = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
    if (idx > 0) baseDir = filePath.slice(0, idx);
  }
  if (!baseDir && workspaces.length > 0) {
    baseDir = workspaces[0];
  }
  if (!baseDir) {
    alert(tStatic("editor.pasteImageNoTarget"));
    return;
  }
  const isMd = isMarkdown(filePath);
  const subtype = mime.split("/")[1]?.toLowerCase() ?? "png";
  const ext = subtype === "jpeg" ? "jpg" : subtype;
  const name = `paste-${Date.now()}.${ext}`;
  const buf = await blob.arrayBuffer();
  const base64 = arrayBufferToBase64(buf);
  try {
    await saveImage(baseDir, name, base64);
    logInfo(`pasted image saved: assets/${name} (${buf.byteLength} bytes)`);
  } catch (err) {
    logError(`paste image save failed: assets/${name}`, err);
    alert(tStatic("editor.saveImageFailed", { err: String(err) }));
    return;
  }
  const rel = `assets/${name}`;
  const insert = isMd ? `![](${rel})` : rel;
  const pos = view.state.selection.main.from;
  view.dispatch({
    changes: { from: pos, insert },
    selection: { anchor: pos + insert.length },
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Configure the minimap with the create() callback. The minimap container
 *  is a tiny DOM element the package owns; we just hand it a fresh div. */
/** Suspense placeholder for the lazy-loaded DiffView / LogPanel / XmindView.
 *  Intentionally blank — the viewer paints quickly enough that any visible
 *  spinner would just flash. */
function LazyFallback() {
  return (
    <div
      style={{
        flex: 1,
        background: "var(--bg)",
      }}
    />
  );
}

function buildMinimap() {
  return showMinimapFacet.of({
    create: () => ({ dom: document.createElement("div") }),
    displayText: "blocks",
    showOverlay: "always",
  });
}

function PdfView({ src, title }: { src: string; title: string }) {
  return (
    <iframe
      src={src}
      title={title}
      style={{
        width: "100%",
        height: "100%",
        border: "none",
        display: "block",
        background: "var(--bg)",
      }}
    />
  );
}

// Cap the hex dump at 256 KB. Larger files would render >16k rows of text and
// stall the browser laying them out; the user can see the start of the file
// and that's enough to identify magic bytes / format. The footer reports the
// truncation so the bytes-shown-vs-total mismatch isn't surprising.
const HEX_MAX_BYTES = 256 * 1024;
const HEX_BYTES_PER_ROW = 16;

function decodeBase64DataUrl(dataUrl: string, maxBytes: number): { bytes: Uint8Array; total: number } {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  // base64 length → byte length: every 4 chars decode to 3 bytes (minus padding).
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  const total = Math.floor(b64.length / 4) * 3 - padding;
  // Decode either the whole thing or just enough base64 chars to cover maxBytes.
  // ceil(maxBytes / 3) groups of 3 → that many * 4 base64 chars.
  const wantBytes = Math.min(total, maxBytes);
  const wantB64Chars = Math.ceil(wantBytes / 3) * 4;
  const slice = b64.slice(0, wantB64Chars);
  const binary = atob(slice);
  const bytes = new Uint8Array(Math.min(binary.length, wantBytes));
  for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, total };
}

function formatHexDump(bytes: Uint8Array): string {
  const lines: string[] = [];
  for (let off = 0; off < bytes.length; off += HEX_BYTES_PER_ROW) {
    const row = bytes.subarray(off, off + HEX_BYTES_PER_ROW);
    const offsetStr = off.toString(16).padStart(8, "0");
    const hexParts: string[] = [];
    let ascii = "";
    for (let i = 0; i < HEX_BYTES_PER_ROW; i++) {
      if (i < row.length) {
        hexParts.push(row[i].toString(16).padStart(2, "0"));
        const c = row[i];
        ascii += c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : ".";
      } else {
        hexParts.push("  ");
        ascii += " ";
      }
      if (i === 7) hexParts.push(""); // gap between the two 8-byte halves
    }
    lines.push(`${offsetStr}  ${hexParts.join(" ")}  ${ascii}`);
  }
  return lines.join("\n");
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function HexView({ dataUrl, filePath }: { dataUrl: string; filePath: string | null }) {
  // Memoize across re-renders of the parent — base64 decode + formatting can
  // be tens of ms for hundred-KB files.
  const { dump, total, shown } = (() => {
    try {
      const { bytes, total } = decodeBase64DataUrl(dataUrl, HEX_MAX_BYTES);
      return { dump: formatHexDump(bytes), total, shown: bytes.length };
    } catch (err) {
      logError("HexView decode failed", err);
      return { dump: "(failed to decode)", total: 0, shown: 0 };
    }
  })();
  const truncated = shown < total;
  return (
    <div className="flex flex-col h-full w-full" style={{ background: "var(--bg)" }}>
      <div
        className="px-3 py-1 text-xs"
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-soft)",
          color: "var(--text-soft)",
          flexShrink: 0,
          fontFamily: "var(--font-mono, ui-monospace, monospace)",
        }}
      >
        {filePath ? filePath.split(/[\\/]/).pop() : "binary"}
        {" · "}
        {formatBytes(total)}
        {truncated && ` · showing first ${formatBytes(shown)}`}
      </div>
      <pre
        className="flex-1 min-h-0 overflow-auto px-3 py-2 text-xs"
        style={{
          margin: 0,
          color: "var(--text)",
          fontFamily: "var(--font-mono, ui-monospace, monospace)",
          tabSize: 4,
          whiteSpace: "pre",
        }}
      >
        {dump}
      </pre>
    </div>
  );
}
