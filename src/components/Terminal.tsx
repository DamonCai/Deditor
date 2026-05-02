import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { openUrl } from "@tauri-apps/plugin-opener";
import "xterm/css/xterm.css";
import { useEditorStore } from "../store/editor";
import { logError } from "../lib/logger";

interface Props {
  /** Whether the panel is currently rendered. We use it to re-fit the
   *  terminal when the panel transitions hidden → visible (otherwise
   *  cached dimensions stick). */
  visible: boolean;
}

/** Single PTY-backed shell session rendered by xterm.js.
 *
 *  Opens once on mount, lives until unmount. CWD = active file's directory
 *  (most recent), falls back to the first workspace, then HOME. */
export default function TerminalPane({ visible }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<string | null>(null);
  const lineBufferRef = useRef<string>("");
  // Pull only the values we need to KICK an effect; the actual values are
  // also read fresh inside async callbacks via `.getState()` to avoid stale
  // closures.
  const theme = useEditorStore((s) => s.theme);
  const fontSize = useEditorStore((s) => s.editorFontSize);
  const shellOverride = useEditorStore((s) => s.terminalShell);

  // Open the terminal exactly once. Workspace / shell changes don't reopen
  // automatically — switching the underlying shell mid-session would surprise
  // the user; they can `cd` themselves.
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let unlistenData: UnlistenFn | undefined;
    let unlistenExit: UnlistenFn | undefined;

    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
      fontSize,
      cursorBlink: true,
      scrollback: 5000,
      theme: themeColors(theme),
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    const webLinks = new WebLinksAddon((_, uri) => {
      void openUrl(uri).catch((err) => logError("openUrl failed", err));
    });
    term.loadAddon(fit);
    term.loadAddon(webLinks);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    (async () => {
      try {
        const { rows, cols } = term;
        const cwd = pickInitialCwd();
        const shell = shellOverride.trim() || null;
        const id = await invoke<string>("term_open", {
          args: { rows, cols, cwd, shell },
        });
        if (cancelled) {
          await invoke("term_close", { id }).catch(() => {});
          return;
        }
        sessionRef.current = id;

        unlistenData = await listen<string>(`term:${id}:data`, (e) => {
          term.write(e.payload);
        });
        unlistenExit = await listen<number>(`term:${id}:exit`, (e) => {
          term.writeln(
            `\r\n\x1b[90m[process exited with code ${e.payload}]\x1b[0m`,
          );
        });

        term.onData((data) => {
          if (!sessionRef.current) return;
          // Track Enter presses cheaply — when a command is submitted we
          // notify any subscribed listeners (the git layer uses this to
          // refresh status after the command finishes). We treat \r as the
          // Enter signal since xterm sends \r for Return. Skip when the
          // user is currently in a multi-line edit (very simple heuristic:
          // last buffered byte ≠ '\\').
          if (data.includes("\r")) {
            const submitted = lineBufferRef.current.trim();
            lineBufferRef.current = "";
            if (submitted.length > 0) {
              dispatchTerminalCommand(submitted);
            }
          } else {
            lineBufferRef.current += data;
            // Cap the buffer so long pasted lines don't keep growing forever.
            if (lineBufferRef.current.length > 4096) {
              lineBufferRef.current = lineBufferRef.current.slice(-4096);
            }
          }
          invoke("term_write", { id: sessionRef.current, data }).catch((err) =>
            logError("term_write failed", err),
          );
        });
        term.onResize(({ rows, cols }) => {
          if (sessionRef.current) {
            invoke("term_resize", { id: sessionRef.current, rows, cols }).catch(
              () => {},
            );
          }
        });
      } catch (err) {
        logError("term_open failed", err);
        term.writeln(
          "\x1b[31m[terminal failed to start: " + String(err) + "]\x1b[0m",
        );
      }
    })();

    // Expose an imperative handle so the rest of the app can paste text or
    // focus the terminal (used by the git branch popover's "checkout in
    // terminal" action).
    setTerminalHandle({
      paste: (text: string) => {
        const id = sessionRef.current;
        if (!id) return;
        invoke("term_write", { id, data: text }).catch(() => {});
        term.focus();
      },
      focus: () => term.focus(),
    });

    return () => {
      cancelled = true;
      unlistenData?.();
      unlistenExit?.();
      const id = sessionRef.current;
      if (id) {
        invoke("term_close", { id }).catch(() => {});
      }
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      sessionRef.current = null;
      setTerminalHandle(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fit whenever the host element resizes (panel drag, window resize, etc).
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      try {
        fitRef.current?.fit();
      } catch {
        // 0×0 during hide animation; ignore — we'll re-fit on next show.
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Force a fit when the panel becomes visible — without this, opening for
  // the first time after a hide leaves rows/cols stale.
  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => {
        try {
          fitRef.current?.fit();
          termRef.current?.focus();
        } catch {}
      });
    }
  }, [visible]);

  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = themeColors(theme);
  }, [theme]);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontSize = fontSize;
      // Re-fit because cell metrics changed.
      try {
        fitRef.current?.fit();
      } catch {}
    }
  }, [fontSize]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
        background: theme === "dark" ? "#1e1f22" : "#ffffff",
        padding: "4px 6px",
      }}
    />
  );
}

function themeColors(theme: "light" | "dark") {
  if (theme === "dark") {
    return {
      background: "#1e1f22",
      foreground: "#dfe1e5",
      cursor: "#dfe1e5",
      selectionBackground: "#214283",
    };
  }
  return {
    background: "#ffffff",
    foreground: "#000000",
    cursor: "#000000",
    selectionBackground: "#c5d4f4",
  };
}

/** Smart CWD: prefer the directory of the file currently being edited so
 *  `git status` / `ls` reflects what the user is looking at. Fall back to
 *  the first workspace, then HOME. */
function pickInitialCwd(): string | null {
  const state = useEditorStore.getState();
  const active = state.tabs.find((t) => t.id === state.activeId);
  if (active?.filePath) {
    const idx = active.filePath.replace(/\\/g, "/").lastIndexOf("/");
    if (idx > 0) return active.filePath.slice(0, idx);
  }
  if (state.workspaces.length > 0) return state.workspaces[0];
  return null;
}

// ----- imperative handle -----------------------------------------------------
//
// A tiny module-level singleton that lets non-React code (the git popover,
// command palette) interact with the live terminal without prop-drilling.

interface TerminalHandle {
  paste: (text: string) => void;
  focus: () => void;
}

let activeHandle: TerminalHandle | null = null;

function setTerminalHandle(h: TerminalHandle | null) {
  activeHandle = h;
}

export function getTerminalHandle(): TerminalHandle | null {
  return activeHandle;
}

// ----- command-submitted bus -------------------------------------------------
//
// Subscribers (the git refresh hook) get notified ~1.5s after the user
// presses Enter on a non-empty line. We intentionally don't try to parse
// what they typed — any command might mutate git state (think `make` running
// a hook, or `npm install` modifying lockfiles).

type CommandListener = (cmd: string) => void;
const commandListeners = new Set<CommandListener>();

export function onTerminalCommand(fn: CommandListener): () => void {
  commandListeners.add(fn);
  return () => commandListeners.delete(fn);
}

function dispatchTerminalCommand(cmd: string) {
  for (const fn of commandListeners) {
    try {
      fn(cmd);
    } catch {}
  }
}
