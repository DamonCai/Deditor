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
  foldGutter,
  foldKeymap,
  LanguageSupport,
} from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import { detectLang, isMarkdown, isImageFile, isPdfFile, isAudioFile, isVideoFile, isHexFile } from "../lib/lang";
import { useEditorStore, type DiffSpec } from "../store/editor";
import DiffView from "./DiffView";
import { isEnabled } from "../lib/shortcuts";
import { saveImage } from "../lib/fileio";
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

export default function Editor({
  value,
  filePath,
  theme,
  fontSize,
  diff,
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
  const softWrap = useEditorStore((s) => s.softWrap);
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
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          ...foldKeymap,
          indentWithTab,
        ]),
        wrapCompartment.current.of(softWrap ? EditorView.lineWrapping : []),
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
    viewRef.current?.dispatch({
      effects: wrapCompartment.current.reconfigure(
        softWrap ? EditorView.lineWrapping : [],
      ),
    });
  }, [softWrap]);

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
