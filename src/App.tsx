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
import GotoAnything from "./components/GotoAnything";
import GotoSymbol from "./components/GotoSymbol";
import FindInFiles from "./components/FindInFiles";
import SettingsDialog from "./components/SettingsDialog";
import CommandPalette from "./components/CommandPalette";
import { isEnabled, SHORTCUTS } from "./lib/shortcuts";
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
  setWorkspaceByPath,
  saveAllDirty,
  reopenLastClosedTab,
} from "./lib/fileio";
import { loadPersisted, schedulePersist } from "./lib/persistence";
import { useFileWatch } from "./lib/fileWatch";

type DragKind = "sidebar" | "preview" | null;

export default function App() {
  const t = useT();
  const { theme, showPreview, previewMaximized, showSidebar, editorFontSize, setContent, language } =
    useEditorStore();
  const active = useActiveTab();
  const filePath = active?.filePath ?? null;
  const content = active?.content ?? "";
  // Diff tabs disable the markdown preview pane and skip the markdown/json
  // toolbars — there's nothing to preview when we're showing a comparison.
  const isDiffTab = !!active?.diff;
  const previewEnabled = !isDiffTab && showPreview && isMarkdown(filePath);
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
  const zenMode = useEditorStore((s) => s.zenMode);
  const autoSave = useEditorStore((s) => s.autoSave);
  const splitEditor = useEditorStore((s) => s.splitEditor);
  const gotoOpen = useEditorStore((s) => s.gotoAnythingOpen);
  const setGotoOpen = useEditorStore((s) => s.setGotoAnythingOpen);
  const settingsOpen = useEditorStore((s) => s.settingsOpen);
  const setSettingsOpen = useEditorStore((s) => s.setSettingsOpen);
  const commandPaletteOpen = useEditorStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useEditorStore((s) => s.setCommandPaletteOpen);
  const gotoSymbolOpen = useEditorStore((s) => s.gotoSymbolOpen);
  const setGotoSymbolOpen = useEditorStore((s) => s.setGotoSymbolOpen);
  const findInFilesOpen = useEditorStore((s) => s.findInFilesOpen);
  const setFindInFilesOpen = useEditorStore((s) => s.setFindInFilesOpen);
  const shortcuts = useEditorStore((s) => s.shortcuts);
  const dragRef = useRef<DragKind>(null);
  const uiRef = useRef({ sidebarPx, previewPct });
  uiRef.current = { sidebarPx, previewPct };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Keep the native OS menu in sync with the language toggle and the user's
  // per-shortcut on/off prefs. Rebuilding the whole menu is cheap; we just
  // need to push the current state every time anything related changes.
  useEffect(() => {
    const disabled = SHORTCUTS
      .filter((s) => s.layer === "menu" && shortcuts[s.id] === false)
      .map((s) => s.id);
    invoke("update_menu_state", {
      lang: language,
      disabledAccelerators: disabled,
    }).catch(() => {});
  }, [language, shortcuts]);

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

  useFileWatch();

  // Auto-save on window blur. Subscribes only when the user opted in via
  // Settings — avoids spurious writes on every alt-tab.
  useEffect(() => {
    if (autoSave !== "onBlur") return;
    const onBlur = () => void saveAllDirty();
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [autoSave]);

  // Auto-save with a debounce after typing stops. Subscribes to the store
  // so we re-arm the timer whenever any tab's content changes.
  useEffect(() => {
    if (autoSave !== "afterDelay") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void saveAllDirty();
      }, 1500);
    };
    // Fire once on activation in case there's already dirty content.
    arm();
    const unsub = useEditorStore.subscribe((s, prev) => {
      if (s.tabs !== prev.tabs) arm();
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [autoSave]);

  // File menu lives in the native macOS app menu (built in Rust). Accelerators
  // there (Cmd+N / Cmd+O / Cmd+S / etc.) are intercepted by the OS, so we
  // only handle the shortcuts the menu doesn't own here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const prefs = useEditorStore.getState().shortcuts;
      const k = e.key.toLowerCase();
      if (k === "b" && !e.shiftKey && !e.altKey) {
        if (!isEnabled(prefs, "app_toggle_sidebar")) return;
        e.preventDefault();
        useEditorStore.getState().toggleSidebar();
      } else if (k === "p" && !e.shiftKey && !e.altKey) {
        // Cmd/Ctrl+P → Goto Anything. Browser default is Print; preventDefault
        // stops that. (Print is still reachable via the Markdown toolbar /
        // export menu for `.md`.)
        if (!isEnabled(prefs, "app_goto_anything")) return;
        e.preventDefault();
        setGotoOpen(true);
      } else if (k === "p" && e.shiftKey && !e.altKey) {
        // Cmd/Ctrl+Shift+P → Command Palette.
        if (!isEnabled(prefs, "app_command_palette")) return;
        e.preventDefault();
        setCommandPaletteOpen(true);
      } else if (k === "f" && e.shiftKey && !e.altKey) {
        // Cmd/Ctrl+Shift+F → Find in Files.
        if (!isEnabled(prefs, "app_find_in_files")) return;
        e.preventDefault();
        setFindInFilesOpen(true);
      } else if (k === "t" && e.shiftKey && !e.altKey) {
        // Cmd/Ctrl+Shift+T → reopen last closed tab. Press repeatedly to
        // walk back up the close stack (Chrome / VSCode parity).
        if (!isEnabled(prefs, "app_reopen_closed_tab")) return;
        e.preventDefault();
        void reopenLastClosedTab();
      } else if (e.key === "," && !e.shiftKey && !e.altKey) {
        // Cmd/Ctrl+, → Settings. Standard macOS preferences shortcut.
        if (!isEnabled(prefs, "app_open_settings")) return;
        e.preventDefault();
        setSettingsOpen(true);
      } else if (k === "r" && !e.shiftKey && !e.altKey) {
        // Cmd/Ctrl+R → Goto Symbol (current file outline).
        if (!isEnabled(prefs, "app_goto_symbol")) return;
        e.preventDefault();
        setGotoSymbolOpen(true);
      } else if (k === "k" && !e.shiftKey && !e.altKey) {
        // Cmd/Ctrl+K → toggle distraction-free (zen) mode. Single keystroke
        // rather than the VSCode chord — chords are clumsy in WebView.
        if (!isEnabled(prefs, "app_zen_mode")) return;
        e.preventDefault();
        useEditorStore.getState().toggleZenMode();
      } else if (e.key === "\\" && !e.shiftKey && !e.altKey) {
        // Cmd/Ctrl+\ → toggle split editor.
        if (!isEnabled(prefs, "app_split_editor")) return;
        e.preventDefault();
        useEditorStore.getState().toggleSplitEditor();
      }
    };
    // Capture phase: WKWebView (and Chromium in some setups) treats certain
    // chords like Cmd+Shift+T as "reopen closed tab" at the browser layer
    // and consumes them before bubble-phase listeners fire. Capture lets us
    // intercept first; we then preventDefault to stop the default action.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
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

  // Tauri OS-level file drag & drop. Files go through openMany (which already
  // routes by extension to text / image / pdf / audio / video / hex viewers);
  // directories get added as a workspace instead of opened as a file.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    getCurrentWebview()
      .onDragDropEvent(async (event) => {
        if (event.payload.type !== "drop") return;
        const filePaths: string[] = [];
        for (const p of event.payload.paths) {
          let kind = "file";
          try {
            kind = await invoke<string>("path_kind", { path: p });
          } catch {
            // Treat probe failures as "file" so the existing openMany path
            // can surface a more useful error.
          }
          if (kind === "dir") {
            await setWorkspaceByPath(p).catch(() => {});
          } else {
            filePaths.push(p);
          }
        }
        if (filePaths.length > 0) await openMany(filePaths);
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
      {!zenMode && <TitleBar />}
      <div className="flex flex-1 min-h-0">
        {!zenMode && showSidebar ? (
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
          {!zenMode && <TabBar />}
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
                  {!isDiffTab && isMarkdown(filePath) && <MarkdownToolbar />}
                  {!isDiffTab && isJson(filePath) && <JsonToolbar />}
                  {active?.externalChange != null && (
                    <ExternalChangeBanner tab={active} />
                  )}
                  <div className="flex-1 min-h-0 flex">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Editor
                        key={active?.id ?? "no-tab"}
                        tabId={active?.id}
                        value={content}
                        filePath={filePath}
                        diff={active?.diff}
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
                    {splitEditor && !isDiffTab && (
                      <>
                        <div style={{ width: 1, background: "var(--border)", flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Editor
                            key={(active?.id ?? "no-tab") + "::split"}
                            tabId={active?.id}
                            noStateCache
                            value={content}
                            filePath={filePath}
                            theme={theme}
                            fontSize={editorFontSize}
                            onChange={setContent}
                          />
                        </div>
                      </>
                    )}
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
      {!zenMode && <StatusBar />}
      <ConfirmDialog />
      <PromptDialog />
      <GotoAnything open={gotoOpen} onClose={() => setGotoOpen(false)} />
      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
      <GotoSymbol open={gotoSymbolOpen} onClose={() => setGotoSymbolOpen(false)} />
      <FindInFiles open={findInFilesOpen} onClose={() => setFindInFilesOpen(false)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function ExternalChangeBanner({ tab }: { tab: { id: string; externalChange?: string } }) {
  const t = useT();
  const reload = () => {
    if (tab.externalChange == null) return;
    const fresh = tab.externalChange;
    useEditorStore.setState({
      tabs: useEditorStore.getState().tabs.map((x) =>
        x.id === tab.id ? { ...x, content: fresh, savedContent: fresh, externalChange: undefined } : x,
      ),
    });
  };
  const dismiss = () => {
    useEditorStore.setState({
      tabs: useEditorStore.getState().tabs.map((x) =>
        x.id === tab.id ? { ...x, externalChange: undefined } : x,
      ),
    });
  };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 12px",
        background: "rgba(245, 158, 11, 0.15)",
        borderBottom: "1px solid var(--border)",
        fontSize: 12,
      }}
    >
      <span style={{ flex: 1, color: "var(--text)" }}>{t("watch.externalChanged")}</span>
      <button
        onClick={reload}
        style={{
          padding: "3px 10px",
          fontSize: 12,
          border: "1px solid var(--accent)",
          background: "var(--accent)",
          color: "#fff",
          borderRadius: 3,
          cursor: "pointer",
        }}
      >
        {t("watch.reload")}
      </button>
      <button
        onClick={dismiss}
        style={{
          padding: "3px 10px",
          fontSize: 12,
          border: "1px solid var(--border)",
          background: "var(--bg)",
          color: "var(--text)",
          borderRadius: 3,
          cursor: "pointer",
        }}
      >
        {t("watch.keepMine")}
      </button>
    </div>
  );
}
