import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import Editor from "./components/Editor";
import Preview from "./components/Preview";
import TitleBar from "./components/TitleBar";
import StatusBar from "./components/StatusBar";
import FileTree from "./components/FileTree";
import ConfirmDialog from "./components/ConfirmDialog";
import PromptDialog from "./components/PromptDialog";
import TabBar from "./components/TabBar";
import MarkdownToolbar from "./components/MarkdownToolbar";
import { useEditorStore, useActiveTab } from "./store/editor";
import { isMarkdown } from "./lib/lang";
import {
  openFile,
  saveFile,
  saveFileAs,
  newFile,
  openFolder,
  closeActiveTab,
  openMany,
} from "./lib/fileio";
import { loadPersisted, schedulePersist } from "./lib/persistence";

type DragKind = "sidebar" | "preview" | null;

export default function App() {
  const { theme, showPreview, previewMaximized, showSidebar, editorFontSize, setContent } =
    useEditorStore();
  const active = useActiveTab();
  const filePath = active?.filePath ?? null;
  const content = active?.content ?? "";
  const previewEnabled = showPreview && isMarkdown(filePath);

  const [sidebarPx, setSidebarPx] = useState(240);
  const [previewPct, setPreviewPct] = useState(50);
  const [scrollLine, setScrollLine] = useState<number | undefined>();
  const [hydrated, setHydrated] = useState(false);
  const dragRef = useRef<DragKind>(null);
  const uiRef = useRef({ sidebarPx, previewPct });
  uiRef.current = { sidebarPx, previewPct };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Hydrate from localStorage on mount
  useEffect(() => {
    loadPersisted()
      .then((extra) => {
        if (extra?.sidebarPx) setSidebarPx(extra.sidebarPx);
        if (extra?.previewPct) setPreviewPct(extra.previewPct);
      })
      .finally(() => setHydrated(true));
  }, []);

  // Persist on any store change (debounced 500ms)
  useEffect(() => {
    if (!hydrated) return;
    const unsub = useEditorStore.subscribe(() => {
      schedulePersist(uiRef.current);
    });
    return unsub;
  }, [hydrated]);

  // Also persist when UI extras (sidebar/preview width) change
  useEffect(() => {
    if (!hydrated) return;
    schedulePersist({ sidebarPx, previewPct });
  }, [hydrated, sidebarPx, previewPct]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "o" && e.shiftKey) {
        e.preventDefault();
        openFolder();
      } else if (k === "o") {
        e.preventDefault();
        openFile();
      } else if (k === "s" && e.shiftKey) {
        e.preventDefault();
        saveFileAs();
      } else if (k === "s") {
        e.preventDefault();
        saveFile();
      } else if (k === "n") {
        e.preventDefault();
        newFile();
      } else if (k === "w") {
        e.preventDefault();
        closeActiveTab();
      } else if (k === "b") {
        e.preventDefault();
        useEditorStore.getState().toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Tauri OS-level file drag & drop
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "drop") {
          openMany(event.payload.paths);
        }
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Suppress browser-level drag default (so Tauri's native handler wins)
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const kind = dragRef.current;
      if (!kind) return;
      if (kind === "sidebar") {
        setSidebarPx(Math.min(500, Math.max(140, e.clientX)));
      } else {
        const sidebar = showSidebar ? sidebarPx : 0;
        const remaining = window.innerWidth - sidebar;
        const editorWidth = e.clientX - sidebar;
        const pct = (editorWidth / remaining) * 100;
        setPreviewPct(100 - Math.min(85, Math.max(15, pct)));
      }
    };
    const onUp = () => {
      dragRef.current = null;
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [sidebarPx, showSidebar]);

  const editorPct = 100 - previewPct;

  return (
    <div className="flex flex-col h-full">
      <TitleBar />
      <div className="flex flex-1 min-h-0">
        {showSidebar ? (
          <>
            <div
              style={{ width: sidebarPx, flexShrink: 0 }}
              className="min-w-0"
            >
              <FileTree />
            </div>
            <div
              className="splitter"
              onMouseDown={() => {
                dragRef.current = "sidebar";
                document.body.style.cursor = "col-resize";
              }}
            />
          </>
        ) : (
          <button
            onClick={() => useEditorStore.getState().setShowSidebar(true)}
            title="展开侧栏 (Cmd/Ctrl+B)"
            style={{
              width: 18,
              flexShrink: 0,
              background: "var(--bg-soft)",
              border: "none",
              borderRight: "1px solid var(--border)",
              cursor: "pointer",
              color: "var(--text-soft)",
              fontSize: 14,
              lineHeight: 1,
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-mute)";
              e.currentTarget.style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--bg-soft)";
              e.currentTarget.style.color = "var(--text-soft)";
            }}
          >
            ›
          </button>
        )}
        <div className="flex flex-col flex-1 min-w-0">
          <TabBar />
          <div className="flex flex-1 min-h-0">
            {previewEnabled && previewMaximized ? (
              <div className="flex-1 min-w-0">
                <Preview
                  source={content}
                  filePath={filePath}
                  theme={theme}
                  scrollLine={scrollLine}
                />
              </div>
            ) : (
              <>
                <div
                  style={{ width: previewEnabled ? `${editorPct}%` : "100%" }}
                  className="min-w-0 flex-1 flex flex-col"
                >
                  {isMarkdown(filePath) && <MarkdownToolbar />}
                  <div className="flex-1 min-h-0">
                    <Editor
                      key={active?.id ?? "no-tab"}
                      value={content}
                      filePath={filePath}
                      theme={theme}
                      fontSize={editorFontSize}
                      onChange={setContent}
                      onScroll={setScrollLine}
                    />
                  </div>
                </div>
                {previewEnabled && (
                  <>
                    <div
                      className="splitter"
                      onMouseDown={() => {
                        dragRef.current = "preview";
                        document.body.style.cursor = "col-resize";
                      }}
                    />
                    <div
                      style={{ width: `${previewPct}%` }}
                      className="min-w-0"
                    >
                      <Preview
                        source={content}
                        filePath={filePath}
                        theme={theme}
                        scrollLine={scrollLine}
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <StatusBar />
      <ConfirmDialog />
      <PromptDialog />
    </div>
  );
}
