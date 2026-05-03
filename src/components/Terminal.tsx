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
  /** Stable React key — distinguishes tabs in the multi-session strip. Used
   *  only for diagnostics here; the PTY id Rust hands back is what we track
   *  internally for term_write / term_resize / term_close. */
  sessionKey: string;
  /** Override for the initial cwd. When set, takes precedence over the
   *  focusedWorkspace / active-tab-workspace heuristics in pickInitialCwd.
   *  Set by the BranchPopover so a "checkout in terminal" lands in the
   *  workspace the popover was anchored to, not whatever was last clicked. */
  initialCwd?: string;
  /** Whether THIS pane is the visible one. Hidden panes stay mounted so their
   *  PTY keeps streaming into xterm's buffer. We re-fit on hidden→visible
   *  transitions because cached cell metrics go stale at 0×0. */
  visible: boolean;
}

/** Single PTY-backed shell session rendered by xterm.js.
 *
 *  Opens once on mount, lives until unmount. CWD = active file's directory
 *  (most recent), falls back to the first workspace, then HOME. */
export default function TerminalPane({ sessionKey: _sessionKey, initialCwd, visible }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionRef = useRef<string | null>(null);
  const handleRef = useRef<TerminalHandle | null>(null);
  const lineBufferRef = useRef<string>("");
  // Pastes that arrived before term_open resolved. Flushed when sessionRef
  // becomes non-null. Without this, the BranchPopover's "checkout in terminal"
  // can race the PTY spawn and silently drop the command.
  const pendingPasteRef = useRef<string[]>([]);
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

    // Append `text` to the in-progress line buffer and dispatch
    // `dispatchTerminalCommand` for each newline-terminated chunk. Mirrors
    // the parsing in term.onData below; called from the imperative paste
    // handle so external pastes (BranchPopover "Checkout", etc.) also
    // notify the git layer when they include a trailing \n.
    const flushPasteAsCommands = (text: string) => {
      let buf = lineBufferRef.current;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === "\r" || ch === "\n") {
          const submitted = buf.trim();
          buf = "";
          if (submitted.length > 0) dispatchTerminalCommand(submitted);
        } else {
          buf += ch;
        }
      }
      // Cap the buffer so a long paste without newlines doesn't grow forever.
      if (buf.length > 4096) buf = buf.slice(-4096);
      lineBufferRef.current = buf;
    };

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
        const cwd = initialCwd ?? pickInitialCwd();
        const shell = shellOverride.trim() || null;
        const id = await invoke<string>("term_open", {
          args: { rows, cols, cwd, shell },
        });
        if (cancelled) {
          await invoke("term_close", { id }).catch(() => {});
          return;
        }
        sessionRef.current = id;
        // Drain any pastes queued before term_open resolved.
        if (pendingPasteRef.current.length > 0) {
          for (const text of pendingPasteRef.current) {
            invoke("term_write", { id, data: text }).catch((err) =>
              logError("term_write (deferred) failed", err),
            );
          }
          pendingPasteRef.current = [];
        }

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

    // Per-pane imperative handle. Registered/unregistered as `visible` flips
    // so external callers (git popover "checkout in terminal" etc.) always
    // hit the pane the user is actually looking at.
    handleRef.current = {
      paste: (text: string) => {
        // Mirror what term.onData does for typed input so paste-driven
        // commands also fire the Enter notification — the git layer relies
        // on this to refresh branch / status after a `git checkout` etc.
        // Without it the status bar branch label stays stale until the user
        // happens to press Enter manually. We dispatch unconditionally
        // (even if the PTY isn't open yet) — the refresh listener debounces
        // and the actual git command will run once the queued bytes flush.
        flushPasteAsCommands(text);
        const id = sessionRef.current;
        if (!id) {
          // PTY isn't open yet — queue and let the term_open callback flush.
          pendingPasteRef.current.push(text);
          return;
        }
        invoke("term_write", { id, data: text }).catch(() => {});
        term.focus();
      },
      focus: () => term.focus(),
    };

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
      // Only relinquish the global handle if we were the one holding it —
      // otherwise we'd accidentally clear a sibling pane's handle.
      if (activeHandle === handleRef.current) setTerminalHandle(null);
      handleRef.current = null;
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
  // the first time after a hide leaves rows/cols stale. Also (re-)claim the
  // global imperative handle so the visible pane is the one external callers
  // target.
  useEffect(() => {
    if (visible) {
      if (handleRef.current) setTerminalHandle(handleRef.current);
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

/** Smart CWD priority:
 *
 *   1. `focusedWorkspace` — the workspace the user just engaged with in the
 *      file tree (clicked the workspace header or a folder under it). Lets
 *      "click folder, hit + in terminal" land in that folder's repo root.
 *   2. Workspace root containing the active file — so build/git commands
 *      (`npm run`, `cargo build`, `git status`) work without a `cd`. We use
 *      the workspace root, NOT the file's own dir, because most of those
 *      commands look at the project root.
 *   3. HOME (`~`) — neutral fallback when neither hint exists. We send the
 *      literal "~" string and let Rust's `expand()` resolve it; without a
 *      cwd hint, the spawned shell would inherit the Tauri parent process's
 *      cwd (often the repo root in dev), which is the surprising default
 *      this function exists to avoid. */
function pickInitialCwd(): string {
  const state = useEditorStore.getState();
  if (state.focusedWorkspace) return state.focusedWorkspace;
  const active = state.tabs.find((t) => t.id === state.activeId);
  if (active?.filePath) {
    const filePath = active.filePath.replace(/\\/g, "/");
    for (const w of state.workspaces) {
      const wn = w.replace(/\\/g, "/");
      if (filePath === wn || filePath.startsWith(wn + "/")) return w;
    }
  }
  return "~";
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
// presses Enter on a non-empty line. The bus lives in lib/terminalBus so
// subscribers can listen without forcing the heavy xterm.js + Terminal
// module into the cold-start bundle. Re-export onTerminalCommand for any
// callers still importing it from the component.
import { dispatchTerminalCommand } from "../lib/terminalBus";
export { onTerminalCommand } from "../lib/terminalBus";
