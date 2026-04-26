import { useEffect, useRef, useState } from "react";
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
} from "@codemirror/view";
import type { Command } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches, selectSelectionMatches, openSearchPanel } from "@codemirror/search";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  indentOnInput,
  bracketMatching,
  LanguageSupport,
} from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import { detectLang, isMarkdown } from "../lib/lang";
import { saveImage } from "../lib/fileio";
import { useEditorStore } from "../store/editor";
import { logError, logInfo } from "../lib/logger";
import { setActiveView } from "../lib/editorBridge";
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

interface Props {
  value: string;
  filePath: string | null;
  theme: "light" | "dark";
  fontSize: number;
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

export default function Editor({
  value,
  filePath,
  theme,
  fontSize,
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
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const langCompartment = useRef(new Compartment());
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
    const state = EditorState.create({
      doc: value,
      selection:
        clampedInitialCursor != null
          ? EditorSelection.cursor(clampedInitialCursor)
          : undefined,
      extensions: [
        lineNumbers(),
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
        keymap.of([
          { key: "Mod-Alt-ArrowUp", run: addCursorVertical(-1), preventDefault: true },
          { key: "Mod-Alt-ArrowDown", run: addCursorVertical(1), preventDefault: true },
          { key: "Mod-Shift-l", run: selectSelectionMatches, preventDefault: true },
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          indentWithTab,
        ]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          if (u.selectionSet || u.docChanged) {
            positionRef.current.cursor = u.state.selection.main.head;
            schedulePositionFlush();
          }
        }),
        themeCompartment.current.of(theme === "dark" ? oneDark : []),
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
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    setActiveView(view);

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
      // Final flush so the very last position isn't lost on tab switch / unmount.
      if (positionFlushTimer.current) {
        clearTimeout(positionFlushTimer.current);
        positionFlushTimer.current = null;
      }
      onPositionChangeRef.current?.({ ...positionRef.current });
      view.destroy();
      viewRef.current = null;
      setActiveView(null);
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
        theme === "dark" ? oneDark : [],
      ),
    });
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    detectLang(filePath)
      .cm()
      .then((support: LanguageSupport) => {
        if (cancelled || !viewRef.current) return;
        viewRef.current.dispatch({
          effects: langCompartment.current.reconfigure(support),
        });
      })
      .catch(() => {
        if (!viewRef.current) return;
        viewRef.current.dispatch({
          effects: langCompartment.current.reconfigure([]),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  const buildCtxItems = (): MenuItem[] => {
    const view = viewRef.current;
    const sel = view?.state.selection.main;
    const hasSelection = !!sel && sel.from !== sel.to;
    return [
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
  };

  return (
    <>
      <div
        ref={hostRef}
        className="h-full w-full overflow-hidden"
        style={{ ["--editor-font-size" as string]: `${fontSize}px` }}
      />
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
