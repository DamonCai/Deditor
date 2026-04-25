import { useEffect, useRef } from "react";
import { EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
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

interface Props {
  value: string;
  filePath: string | null;
  theme: "light" | "dark";
  fontSize: number;
  /** External scroll line (driven by preview); will scroll editor to that line. */
  externalScrollLine?: number;
  onChange: (value: string) => void;
  onScroll?: (firstVisibleLine: number) => void;
}

export default function Editor({
  value,
  filePath,
  theme,
  fontSize,
  externalScrollLine,
  onChange,
  onScroll,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const langCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onScrollRef = useRef(onScroll);
  // Suppress outgoing scroll events for this many ms after a programmatic scroll,
  // to prevent the editor⇄preview sync from echoing back and forth.
  const suppressOutgoingUntil = useRef(0);
  onChangeRef.current = onChange;
  onScrollRef.current = onScroll;

  useEffect(() => {
    if (!hostRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        indentOnInput(),
        bracketMatching(),
        highlightSelectionMatches(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
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
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    setActiveView(view);

    // Direct scroll-event listener for smooth, every-frame outgoing sync.
    let scrollRafId = 0;
    const onScrollEvt = () => {
      if (Date.now() < suppressOutgoingUntil.current) return;
      if (!onScrollRef.current) return;
      if (scrollRafId) return;
      scrollRafId = requestAnimationFrame(() => {
        scrollRafId = 0;
        const top = view.scrollDOM.scrollTop;
        try {
          const block = view.lineBlockAtHeight(top);
          const line = view.state.doc.lineAt(block.from).number;
          onScrollRef.current?.(line);
        } catch {
          /* during destroy / odd states; ignore */
        }
      });
    };
    view.scrollDOM.addEventListener("scroll", onScrollEvt, { passive: true });

    return () => {
      view.scrollDOM.removeEventListener("scroll", onScrollEvt);
      if (scrollRafId) cancelAnimationFrame(scrollRafId);
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

  return (
    <div
      ref={hostRef}
      className="h-full w-full overflow-hidden"
      style={{ ["--editor-font-size" as string]: `${fontSize}px` }}
    />
  );
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
    alert("请先保存文件或打开文件夹后再粘贴图片");
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
    alert(`保存图片失败: ${err}`);
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
