import { markdownSession, sourceChange } from "../lib/markdownSession";
import { installMarkdownComposition } from "../lib/markdownComposition";
import { markdownHistory } from "../lib/markdownHistory";
import { showError } from "../lib/feedback";
import { documentStatsField } from "../lib/documentStats";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { EditorState, EditorSelection, Compartment, StateEffect, Transaction } from "@codemirror/state";
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
// @replit/codemirror-minimap (~45 KB) is only used when the user explicitly
// enables the minimap in Settings — default is off. Lazy-import via a cached
// promise; the first mount with showMinimap=true awaits, subsequent toggles
// hit the cache instantly.
let minimapModulePromise: Promise<typeof import("@replit/codemirror-minimap")> | null = null;
function loadMinimap() {
  if (!minimapModulePromise) minimapModulePromise = import("@replit/codemirror-minimap");
  return minimapModulePromise;
}
import type { Command } from "@codemirror/view";
import { copyLineDown, defaultKeymap, history, historyField, historyKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches, selectSelectionMatches, openSearchPanel } from "@codemirror/search";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { markdownTableKeymap } from "../lib/markdownTable";
import { colorPreview } from "../lib/colorPreview";
import { inspectionMarkers } from "../lib/inspectionMarkers";
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
import DiffView from "./DiffView";
// XmindView loads the local SVG canvas and lossless XMind document model.
// Only mounted when a .xmind file is open — lazy-load so non-XMind users
// never pay for it on cold start.
const XmindView = lazy(() => import("./XmindView"));
import { isEnabled } from "../lib/shortcuts";
import { installEditorFontZoom } from "../lib/editorFontZoom";
import EditorFontZoomNotice from "./EditorFontZoomNotice";
import {
  bookmarkExtension,
  toggleBookmark,
  nextBookmark,
  prevBookmark,
  clearBookmarks,
} from "../lib/bookmarks";
import { saveImage } from "../lib/fileio";
import { codeBlockCompletion } from "../lib/codeBlockComplete";
import { logError, logInfo } from "../lib/logger";
import { setActiveView, getActiveView, notifyActiveEditor } from "../lib/editorBridge";
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
  /** Active tab id. Used to look up / save the per-tab CodeMirror state JSON
   *  so undo/redo history survives switching to another tab and back. */
  tabId?: string;
  /** True when this is the visible Editor inside its host (EditorHost keeps
   *  many Editors mounted; only one is active at a time). The active Editor
   *  registers itself with editorBridge so toolbar buttons + undo target the
   *  correct view. Without this flag, the last-mounted Editor would win
   *  forever — buttons would silently mutate a hidden tab. */
  active?: boolean;
  /** When true, skip the per-tab state cache entirely. Used by the secondary
   *  Editor in split-view so it doesn't collide with the primary on cache
   *  reads/writes. Trade-off: secondary view's undo doesn't carry across
   *  tab switches. */
  noStateCache?: boolean;
  /** When set, the active tab is a side-by-side file comparison; we short-
   *  circuit and render DiffView, ignoring CodeMirror entirely. */
  diff?: DiffSpec;
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

// editorStateCache lives in its own module (lib/editorStateCache.ts) so
// main.tsx can prune the cache without static-importing this file — which
// would drag CodeMirror back into the main chunk and undo the lazy split.
import {
  getEditorStateCache,
  setEditorStateCache,
} from "../lib/editorStateCache";

export default function Editor(props: Props) {
  const { value, filePath, tabId, diff } = props;
  // Diff tab — render the side-by-side comparison.
  if (diff) {
    return <DiffView spec={diff} />;
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
  // XMind workbook — dedicated canvas and document editor.
  if (isXmindFile(filePath) && value.startsWith("data:")) {
    return (
      <Suspense fallback={<div style={{ padding: 16, color: "var(--text-soft)" }}>Loading…</div>}>
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
  return <TextEditor {...props} />;
}

// Keep the text editor's hooks in their own component. Save As or binary
// hydration can change the renderer without changing the owning tab ID.
function TextEditor({
  value,
  filePath,
  theme,
  fontSize,
  tabId,
  active,
  noStateCache,
  initialCursor,
  initialScrollLine,
  externalScrollLine,
  onChange,
  onScroll,
  onPositionChange,
}: Props) {
  const t = useT();
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const effectiveFontSize = useEditorStore((s) => s.tabs.find((tab) => tab.id === tabId)?.zoomFontSize ?? fontSize);
  const [fontZoomRevision, setFontZoomRevision] = useState(0);
  const dismissFontZoom = useCallback(() => setFontZoomRevision(0), []);
  const returnEditorFocus = useCallback(() => viewRef.current?.focus(), []);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const langCompartment = useRef(new Compartment());
  const wrapCompartment = useRef(new Compartment());
  const indentCompartment = useRef(new Compartment());
  const whitespaceCompartment = useRef(new Compartment());
  const minimapCompartment = useRef(new Compartment());
  const completionCompartment = useRef(new Compartment());
  const autoCloseCompartment = useRef(new Compartment());
  const softWrap = useEditorStore((s) => s.softWrap);
  const showIndentGuides = useEditorStore((s) => s.showIndentGuides);
  const showWhitespace = useEditorStore((s) => s.showWhitespace);
  const showMinimap = useEditorStore((s) => s.showMinimap);
  const autoCloseBrackets = useEditorStore((s) => s.autoCloseBrackets);
  const onChangeRef = useRef(onChange);
  // Track the most recent text WE emitted via onChange. The `value` sync
  // effect below compares against this ref so a keystroke (CodeMirror →
  // onChange → setContent → store → re-render → new value prop) skips
  // the O(N) doc.toString() + string-compare path. For a 100 KB markdown
  // file that was ~200 KB of allocation per keystroke; now zero.
  const lastEmittedRef = useRef<string | null>(null);
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
          ...(tabId && isMarkdown(filePath) ? [
            { key: "Mod-z", run: () => markdownHistory(false, tabId) },
            { key: "Mod-Shift-z", run: () => markdownHistory(true, tabId) },
            { key: "Mod-y", run: () => markdownHistory(true, tabId) },
          ] : []),
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
        // Minimap starts out empty — if the user has it enabled, the effect
        // below dispatches a reconfigure once the module finishes loading.
        // Avoids blocking initial mount on a 45 KB lazy chunk.
        minimapCompartment.current.of([]),
        autoCloseCompartment.current.of(autoCloseBrackets ? closeBrackets() : []),
        completionCompartment.current.of(
          isMarkdown(filePath) ? codeBlockCompletion() : [],
        ),
        // Color swatch widgets — only enabled for languages where color
        // literals appear naturally. Enabling globally would noisily decorate
        // identifiers like `rgb(...)` in unrelated code that happens to match.
        colorPreviewSupported(filePath) ? colorPreview() : [],
        documentStatsField,
        bookmarkExtension(),
        inspectionMarkers(),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            const next = u.state.doc.toString();
            // Stash before notifying upstream so the resulting React render
            // (which arrives as the `value` prop on the next tick) recognizes
            // its own echo and skips the sync effect's O(N) compare.
            lastEmittedRef.current = next;
            if (getActiveView() === u.view) setActiveView(u.view, tabId, next);
            onChangeRef.current(next);
          }
          if (u.selectionSet && !u.docChanged && getActiveView() === u.view) notifyActiveEditor();
          if (u.selectionSet && getActiveView() === u.view && tabId && isMarkdown(filePath)) {
            markdownSession(tabId, useEditorStore.getState().tabs.find(t => t.id === tabId)?.content ?? u.state.doc.toString()).sourceCursor = u.state.selection.main.head;
          }
          if (u.selectionSet || u.docChanged) {
            positionRef.current.cursor = u.state.selection.main.head;
            schedulePositionFlush();
            // Update the StatusBar's selection-length readout. Sum every
            // range so multi-cursor selections still report a useful total.
            let selLen = 0;
            for (const r of u.state.selection.ranges) selLen += r.to - r.from;
            if (getActiveView() === u.view) useEditorStore.getState().setActiveSelectionLength(selLen);
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
    const cachedJSON = tabId && !noStateCache ? getEditorStateCache(tabId) : undefined;
    let state: EditorState;
    if (cachedJSON instanceof EditorState && cachedJSON.doc.toString() === value) {
      state = cachedJSON.update({ effects: StateEffect.reconfigure.of(extensions) }).state;
    } else if (cachedJSON && (cachedJSON as { doc?: string }).doc === value) {
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
    const removeFontZoom = installEditorFontZoom(view.scrollDOM, tabId, () => setFontZoomRevision((n) => n + 1));
    viewRef.current = view;
    // Capture native menu/gesture history before CodeMirror's own history plugin.
    const beforeNativeHistory = (event: InputEvent) => {
      if (!tabId || !isMarkdown(filePath) || !["historyUndo", "historyRedo"].includes(event.inputType)) return;
      event.preventDefault(); event.stopPropagation();
      markdownHistory(event.inputType === "historyRedo", tabId);
    };
    view.contentDOM.addEventListener("beforeinput", beforeNativeHistory, true);
    if (active !== false) setActiveView(view, tabId);

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
    // Emits a *fractional* source line (e.g. 42.37) so Preview can interpolate
    // between adjacent [data-line] markers instead of snapping to the nearest
    // one. End-of-doc is signalled by emitting `doc.lines + 1` — Preview reads
    // anything larger than its own source's total line count as "scroll to max"
    // so reaching the editor's bottom truly anchors the preview's bottom too.
    let scrollRafId = 0;
    const onScrollEvt = () => {
      if (scrollRafId) return;
      scrollRafId = requestAnimationFrame(() => {
        scrollRafId = 0;
        const dom = view.scrollDOM;
        const top = dom.scrollTop;
        const max = Math.max(0, dom.scrollHeight - dom.clientHeight);
        try {
          let fracLine: number;
          if (max > 0 && max - top < 2) {
            // atBottom sentinel — preview will snap to its own scrollMax.
            fracLine = view.state.doc.lines + 1;
          } else {
            const block = view.lineBlockAtHeight(top);
            const baseLine = view.state.doc.lineAt(block.from).number;
            const frac =
              block.height > 0
                ? Math.max(0, Math.min(1, (top - block.top) / block.height))
                : 0;
            fracLine = baseLine + frac;
          }
          // Persist integer-rounded line (schema stays compatible with v3).
          positionRef.current.scrollTopLine = Math.max(
            1,
            Math.min(view.state.doc.lines, Math.round(fracLine)),
          );
          schedulePositionFlush();
          // But don't echo programmatic scrolls back through editor⇄preview sync.
          if (Date.now() >= suppressOutgoingUntil.current) {
            onScrollRef.current?.(fracLine);
          }
        } catch {
          /* during destroy / odd states; ignore */
        }
      });
    };
    view.scrollDOM.addEventListener("scroll", onScrollEvt, { passive: true });
    const composition = tabId && isMarkdown(filePath)
      ? installMarkdownComposition(view.contentDOM, markdownSession(tabId, useEditorStore.getState().tabs.find(t => t.id === tabId)?.content ?? view.state.doc.toString()), { origin: "source" })
      : null;

    return () => {
      composition?.destroy();
      removeFontZoom();
      view.contentDOM.removeEventListener("beforeinput", beforeNativeHistory, true);
      view.scrollDOM.removeEventListener("scroll", onScrollEvt);
      if (scrollRafId) cancelAnimationFrame(scrollRafId);
      // Final flush so the very last position isn't lost on tab switch / unmount.
      if (positionFlushTimer.current) {
        clearTimeout(positionFlushTimer.current);
        positionFlushTimer.current = null;
      }
      onPositionChangeRef.current?.({ ...positionRef.current });
      // Stash state JSON (incl. undo history) for next mount of the same tab.
      if (tabId && !noStateCache) {
        try {
          if (useEditorStore.getState().tabs.some((t) => t.id === tabId)) {
            setEditorStateCache(tabId, view.state);
            useEditorStore.getState().setTabPosition(tabId, { ...positionRef.current });
          }
        } catch {
          /* defensive: never block unmount on a serialization error */
        }
      }
      view.destroy();
      viewRef.current = null;
      if (getActiveView() === view) setActiveView(null);
      // Clear the StatusBar readout so a closed editor's last selection
      // count doesn't linger over the next tab.
      if (!getActiveView()) useEditorStore.getState().setActiveSelectionLength(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toolbar / undo target. EditorHost mounts every visited tab's Editor and
  // toggles `display` on the wrappers; `setActiveView` from the mount effect
  // above alone would freeze on whichever Editor mounted LAST (always the
  // hidden one after a tab switch). Re-register on every active flip so the
  // visible Editor wins. Skipped for the split-view secondary (active is
  // undefined there) so the primary tab keeps owning the toolbar even when
  // the user's focus is on the split clone.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (active === false) { if (getActiveView() === view) setActiveView(null); return; }
    if (active === undefined) return;
    setActiveView(view, tabId);
    if (tabId && isMarkdown(filePath)) {
      const cursor = markdownSession(tabId, useEditorStore.getState().tabs.find(t => t.id === tabId)?.content ?? view.state.doc.toString()).sourceCursor;
      if (cursor !== null) view.dispatch({ selection: { anchor: Math.min(view.state.doc.length, cursor) }, scrollIntoView: true });
    }
    view.requestMeasure();
    useEditorStore.getState().setActiveSelectionLength(view.state.selection.ranges.reduce((n, r) => n + r.to - r.from, 0));
  }, [active]);

  useEffect(() => { viewRef.current?.requestMeasure(); }, [effectiveFontSize]);

  // Apply external scroll requests (e.g. from preview). Accepts a *fractional*
  // line so preview can drive editor to a sub-line pixel offset; any value
  // greater than the doc's total line count is treated as an "atBottom"
  // sentinel and pins the editor's scroll to its max.
  //
  // Reading-mode subtlety: while the user is in preview-maximized (reading)
  // mode the editor pane has `display: none`, which means scrollDOM has
  // clientHeight === 0 and writes to `scrollTop` are no-ops. If we don't
  // handle that, navigating preview during reading mode won't update the
  // editor, and exiting reading mode leaves the editor at its pre-reading
  // position. Detect the zero-layout case and defer the scroll via a
  // ResizeObserver — when the editor pane becomes visible again, scrollDOM
  // gains size and we apply the latest pending line.
  useEffect(() => {
    if (externalScrollLine == null) return;
    const view = viewRef.current;
    if (!view) return;
    const dom = view.scrollDOM;

    const applyScroll = (): boolean => {
      // No layout → can't honor the write; tell caller to wait.
      if (dom.clientHeight === 0) return false;
      const total = view.state.doc.lines;
      try {
        if (externalScrollLine > total) {
          suppressOutgoingUntil.current = Date.now() + 200;
          dom.scrollTop = Math.max(0, dom.scrollHeight - dom.clientHeight);
          return true;
        }
        const clamped = Math.max(1, externalScrollLine);
        const floor = Math.min(total, Math.floor(clamped));
        const frac = Math.max(0, Math.min(1, clamped - floor));
        const line = view.state.doc.line(floor);
        const block = view.lineBlockAt(line.from);
        const target = block.top + frac * block.height;
        suppressOutgoingUntil.current = Date.now() + 200;
        dom.scrollTop = target;
        return true;
      } catch {
        // Doc shorter than expected — treat as applied so we don't loop.
        return true;
      }
    };

    if (applyScroll()) return;

    // Editor isn't laid out right now (likely display:none from reading
    // mode). Watch for size changes; the first non-zero clientHeight means
    // the pane is back on screen — apply the pending line then.
    const observer = new ResizeObserver(() => {
      if (applyScroll()) observer.disconnect();
    });
    observer.observe(dom);
    return () => observer.disconnect();
  }, [externalScrollLine]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    // Fast path: this `value` is our own echo (we just emitted it via the
    // updateListener above). Skip the O(N) doc.toString() + string compare
    // entirely — saves ~200 KB of allocation per keystroke on a 100 KB file.
    if (lastEmittedRef.current === value) return;
    // Slow path: external source updated `value` (persistence reload,
    // external file watch, programmatic setContent). Diff doc against the
    // new value, replace if different.
    if (view.state.doc.toString() === value) return;
    if (isMarkdown(filePath)) {
      const change = sourceChange(view.state.doc.toString(), value);
      view.dispatch({ changes: { from: change.from, to: change.from + change.removed.length, insert: change.inserted }, annotations: Transaction.addToHistory.of(false) });
    } else view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
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
    if (!showMinimap) {
      viewRef.current?.dispatch({
        effects: minimapCompartment.current.reconfigure([]),
      });
      return;
    }
    // Async: load the minimap module on demand. Cancel if showMinimap flips
    // off before the module arrives, or if the view was destroyed.
    let cancelled = false;
    const v = viewRef.current;
    void buildMinimapAsync().then((ext) => {
      if (cancelled || !v || viewRef.current !== v) return;
      v.dispatch({ effects: minimapCompartment.current.reconfigure(ext) });
    });
    return () => { cancelled = true; };
  }, [showMinimap]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: autoCloseCompartment.current.reconfigure(
        autoCloseBrackets ? closeBrackets() : [],
      ),
    });
  }, [autoCloseBrackets]);

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
        if (cancelled || !viewRef.current) return;
        logError(`load language failed for ${filePath ?? "(no path)"}`, err);
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
    return items;
  };

  return (
    <>
      <div className="relative h-full w-full">
        <div
          ref={hostRef}
          className="h-full w-full overflow-hidden"
          style={{ ["--editor-font-size" as string]: `${effectiveFontSize}px` }}
        />
        {tabId && fontZoomRevision > 0 && <EditorFontZoomNotice tabId={tabId} revision={fontZoomRevision}
          onDismiss={dismissFontZoom} onReturnFocus={returnEditorFocus} />}
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
    void showError(tStatic("editor.pasteImageNoTarget"));
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
    void showError(tStatic("editor.saveImageFailed", { err: String(err) }));
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

/** Resolve the minimap extension lazily; callers await this. */
async function buildMinimapAsync() {
  const { showMinimap: showMinimapFacet } = await loadMinimap();
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
