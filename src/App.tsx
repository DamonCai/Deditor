import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import Editor from "./components/Editor";
import Preview from "./components/Preview";
import TitleBar from "./components/TitleBar";
import StatusBar from "./components/StatusBar";
import FileTree from "./components/FileTree";
import ConfirmDialog from "./components/ConfirmDialog";
import PromptDialog from "./components/PromptDialog";
import TabBar from "./components/TabBar";
import MarkdownToolbar from "./components/MarkdownToolbar";
import JsonToolbar from "./components/JsonToolbar";
import { useEditorStore, useActiveTab } from "./store/editor";
import { isMarkdown, isJson } from "./lib/lang";
import { useT } from "./lib/i18n";
import {
  openFile,
  openFileByPath,
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
  const t = useT();
  const { theme, showPreview, previewMaximized, showSidebar, editorFontSize, setContent, language } =
    useEditorStore();
  const active = useActiveTab();
  const filePath = active?.filePath ?? null;
  const content = active?.content ?? "";
  const previewEnabled = showPreview && isMarkdown(filePath);
  // Initial caret + scroll for the active tab. Read imperatively so subscribing
  // components don't re-render every cursor move; Editor only consumes these
  // on mount (a fresh instance is created via `key={tab.id}` per active tab).
  const initialPos = active
    ? useEditorStore.getState().tabPositions[active.id]
    : undefined;

  const [sidebarPx, setSidebarPx] = useState(240);
  const [previewPct, setPreviewPct] = useState(50);
  // Editor↔Preview scroll sync. We track the latest line + which side originated
  // the scroll so each side only reacts to scrolls coming from the OTHER side.
  const [scrollSync, setScrollSync] = useState<
    { line: number; from: "editor" | "preview" } | null
  >(null);
  const [hydrated, setHydrated] = useState(false);
  const dragRef = useRef<DragKind>(null);
  const uiRef = useRef({ sidebarPx, previewPct });
  uiRef.current = { sidebarPx, previewPct };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Keep the native macOS / OS-level app menu in sync with the in-app
  // language toggle. Rebuild on initial mount + on every language change.
  useEffect(() => {
    invoke("update_menu_language", { lang: language }).catch(() => {});
  }, [language]);

  // Hydrate from localStorage on mount
  useEffect(() => {
    loadPersisted()
      .then((extra) => {
        if (extra?.sidebarPx) setSidebarPx(extra.sidebarPx);
        if (extra?.previewPct) setPreviewPct(extra.previewPct);
      })
      .finally(() => setHydrated(true));
  }, []);

  // Persist on any store change (debounced 500ms).
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

  // File menu lives in the native macOS app menu (built in Rust). Accelerators
  // there (Cmd+N / Cmd+O / Cmd+S / etc.) are intercepted by the OS, so we
  // only handle the shortcuts the menu doesn't own here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "b") {
        e.preventDefault();
        useEditorStore.getState().toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Bridge native File menu clicks to the existing fileio handlers.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    listen<string>("menu-action", (e) => {
      switch (e.payload) {
        case "file_new": newFile(); break;
        case "file_open": openFile(); break;
        case "file_open_folder": openFolder(); break;
        case "file_save": saveFile(); break;
        case "file_save_as": saveFileAs(); break;
        case "file_close_tab": closeActiveTab(); break;
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

  // OS-level "Open With → DEditor" (macOS Finder, Windows file association,
  // `open -a DEditor file.sql` from a terminal, etc.). Tauri raises a
  // RunEvent::Opened and our Rust glue re-emits it as `open-file` with the
  // absolute path string. Reuse the regular openFileByPath flow.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    listen<string>("open-file", (e) => {
      if (e.payload) void openFileByPath(e.payload);
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
            title={t("filetree.expand")}
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
                  scrollLine={
                    scrollSync?.from === "editor" ? scrollSync.line : undefined
                  }
                  onScroll={(line) => setScrollSync({ line, from: "preview" })}
                />
              </div>
            ) : (
              <>
                <div
                  style={{ width: previewEnabled ? `${editorPct}%` : "100%" }}
                  className="min-w-0 flex-1 flex flex-col"
                >
                  {isMarkdown(filePath) && <MarkdownToolbar />}
                  {isJson(filePath) && <JsonToolbar />}
                  <div className="flex-1 min-h-0">
                    <Editor
                      key={active?.id ?? "no-tab"}
                      value={content}
                      filePath={filePath}
                      theme={theme}
                      fontSize={editorFontSize}
                      initialCursor={initialPos?.cursor}
                      initialScrollLine={initialPos?.scrollTopLine}
                      externalScrollLine={
                        scrollSync?.from === "preview" ? scrollSync.line : undefined
                      }
                      onChange={setContent}
                      onScroll={(line) => setScrollSync({ line, from: "editor" })}
                      onPositionChange={(pos) => {
                        if (active) {
                          useEditorStore.getState().setTabPosition(active.id, pos);
                        }
                      }}
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
                        scrollLine={
                          scrollSync?.from === "editor" ? scrollSync.line : undefined
                        }
                        onScroll={(line) =>
                          setScrollSync({ line, from: "preview" })
                        }
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
