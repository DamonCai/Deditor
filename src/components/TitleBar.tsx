import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useActiveTab, isTabDirty } from "../store/editor";
import { useEditorStore } from "../store/editor";
import { useT } from "../lib/i18n";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  FiSettings,
  FiSearch,
  FiSun,
  FiMoon,
  FiGitBranch,
  FiChevronDown,
  FiAlertTriangle,
} from "react-icons/fi";
import { Button } from "./ui/Button";
import {
  onBranchPopoverRequest,
  useGitBranch,
  workspaceOf,
} from "../lib/git";
import BranchPopover from "./BranchPopover";

interface RepoState {
  state: string;
  conflict_count: number;
}

interface AheadBehind {
  ahead: number;
  behind: number;
  upstream: string;
}

// macOS draws traffic lights inside our overlay-styled title bar; reserve ~80px
// on the left so the controls don't overlap the leftmost toolbar content.
const IS_MAC =
  typeof navigator !== "undefined" &&
  /(Mac|iPad|iPhone|iPod)/i.test(navigator.userAgent);

// data-tauri-drag-region only fires when the literal mousedown target carries
// the attribute — it does not bubble. Imperatively starting the drag from a
// single root mousedown handler is more robust: any descendant that isn't an
// interactive control (button, input, link) becomes a drag handle.
function onTitleBarMouseDown(e: React.MouseEvent<HTMLDivElement>) {
  if (e.button !== 0) return;
  const target = e.target as HTMLElement;
  if (target.closest("button, a, input, textarea, select, [role='button']")) {
    return;
  }
  if (e.detail === 2) {
    void getCurrentWindow().toggleMaximize();
    return;
  }
  void getCurrentWindow().startDragging();
}

/** IntelliJ-style Main Toolbar. App identity on the left, current file name in
 *  the middle (which also acts as the window drag handle), global actions
 *  (search / settings) on the right.
 *
 *  We don't ship git / run config like IntelliJ does — DEditor isn't an IDE —
 *  so the toolbar stays narrow and uncluttered. */
function repoStateLabelKey(state: string): string {
  switch (state) {
    case "merging":
      return "repoState.merging";
    case "rebasing":
      return "repoState.rebasing";
    case "cherry-picking":
      return "repoState.cherryPicking";
    case "reverting":
      return "repoState.reverting";
    case "bisecting":
      return "repoState.bisecting";
    default:
      return "repoState.merging";
  }
}

export default function TitleBar() {
  const t = useT();
  const active = useActiveTab();
  const setSettingsOpen = useEditorStore((s) => s.setSettingsOpen);
  const setGotoAnythingOpen = useEditorStore((s) => s.setGotoAnythingOpen);
  const theme = useEditorStore((s) => s.theme);
  const setTheme = useEditorStore((s) => s.setTheme);
  const workspaces = useEditorStore((s) => s.workspaces);
  const focusedWorkspace = useEditorStore((s) => s.focusedWorkspace);
  const setFocusedWorkspace = useEditorStore((s) => s.setFocusedWorkspace);
  // Branch owner mirrors the StatusBar logic: explicit focus first, then
  // active file's workspace, then first workspace. Lets the user navigate
  // folders to see the right branch even before opening a file in that repo.
  const filePath = active?.filePath ?? null;
  const branchOwner =
    focusedWorkspace ??
    workspaceOf(filePath, workspaces) ??
    workspaces[0] ??
    null;
  const branch = useGitBranch(branchOwner);
  const [branchPopoverOpen, setBranchPopoverOpen] = useState(false);
  const branchAnchor = useRef<HTMLButtonElement>(null);
  const openGitDialog = useEditorStore((s) => s.openGitDialog);
  const [repoState, setRepoState] = useState<RepoState>({
    state: "clean",
    conflict_count: 0,
  });
  const [aheadBehind, setAheadBehind] = useState<AheadBehind>({
    ahead: 0,
    behind: 0,
    upstream: "",
  });

  // Poll repo-state periodically — surfaces ongoing merge / rebase / cherry-
  // pick / revert / bisect as a warning chip with conflict count. Cheap
  // (just inspects .git directory, no network), 4-second interval.
  const pollRepoState = useCallback(async () => {
    if (!branchOwner) {
      setRepoState({ state: "clean", conflict_count: 0 });
      setAheadBehind({ ahead: 0, behind: 0, upstream: "" });
      return;
    }
    try {
      const [r, ab] = await Promise.all([
        invoke<RepoState>("git_repo_state", { workspace: branchOwner }),
        invoke<AheadBehind>("git_ahead_behind", { workspace: branchOwner }),
      ]);
      setRepoState(r);
      setAheadBehind(ab);
    } catch {
      /* not a git repo; clean is fine */
    }
  }, [branchOwner]);

  useEffect(() => {
    void pollRepoState();
    const id = window.setInterval(() => void pollRepoState(), 4000);
    const onFocus = () => void pollRepoState();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [pollRepoState]);

  // Subscribe to the global request bus so the FileTree → Git → Branches…
  // submenu can open this popover without prop-drilling. Refocus the target
  // workspace so the popover queries the right repo on first render.
  useEffect(() => {
    return onBranchPopoverRequest((ws) => {
      setFocusedWorkspace(ws);
      setBranchPopoverOpen(true);
    });
  }, [setFocusedWorkspace]);

  const name = active?.filePath
    ? active.filePath.split(/[\\/]/).pop()
    : t("common.untitled");
  const dirty = active ? isTabDirty(active) : false;

  return (
    <div
      className="flex items-center select-none"
      onMouseDown={onTitleBarMouseDown}
      style={{
        // 40px matches IntelliJ New UI Main Toolbar; traffic-light center
        // (y=14 + 6 = 20) aligns exactly with content vertical center (40/2).
        // Keep 84px reserved on macOS even in fullscreen — the OS hides the
        // traffic lights then, so the gap looks empty but never causes the
        // overlap we'd get if we tried (and failed) to detect the transition.
        height: 40,
        padding: `0 8px 0 ${IS_MAC ? 84 : 12}px`,
        fontSize: 12,
        background: "var(--bg-soft)",
        borderBottom: "1px solid var(--border)",
        gap: 12,
      }}
    >
      {/* App identity. Mirrors IntelliJ's project-name button — static-styled,
          no popover wired up because we don't model multiple projects. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontWeight: 600,
          color: "var(--text)",
          letterSpacing: "0.02em",
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            borderRadius: 4,
            background: "var(--accent)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          D
        </span>
        <span>DEditor</span>
      </div>

      {/* Branch dropdown — JetBrains-style, sits next to the project identity.
       *  Only renders when the active workspace is a git repo. */}
      {branch && branchOwner && (
        <>
          <button
            ref={branchAnchor}
            onClick={() => setBranchPopoverOpen((o) => !o)}
            title={t("statusbar.branch")}
            className="deditor-btn"
            data-variant="ghost"
            data-pressed={branchPopoverOpen ? "true" : undefined}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: branchPopoverOpen ? "var(--bg-mute)" : "transparent",
              border: "none",
              color: "var(--text)",
              padding: "0 8px",
              height: 24,
              fontSize: 12,
              cursor: "pointer",
              borderRadius: 4,
            }}
          >
            <FiGitBranch size={13} style={{ color: "var(--text-soft)" }} />
            <span
              className="truncate"
              style={{ maxWidth: 200, fontWeight: 500 }}
            >
              {branch}
            </span>
            <FiChevronDown size={11} style={{ color: "var(--text-soft)" }} />
          </button>
          {branchPopoverOpen && (
            <BranchPopover
              workspace={branchOwner}
              anchor={branchAnchor}
              onClose={() => setBranchPopoverOpen(false)}
            />
          )}
        </>
      )}

      {/* Ahead/behind chip — only renders when there's actual divergence. */}
      {branchOwner &&
        (aheadBehind.ahead > 0 || aheadBehind.behind > 0) && (
          <button
            onClick={() => {
              if (aheadBehind.ahead > 0) {
                openGitDialog({ kind: "push", workspace: branchOwner });
              } else {
                // behind only → kick off a pull
                void invoke("git_fetch_silent", { workspace: branchOwner });
              }
            }}
            title={
              aheadBehind.ahead > 0 && aheadBehind.behind > 0
                ? t("vcs.bothHint", {
                    ahead: String(aheadBehind.ahead),
                    behind: String(aheadBehind.behind),
                  })
                : aheadBehind.ahead > 0
                  ? t("vcs.aheadHint", { ahead: String(aheadBehind.ahead) })
                  : t("vcs.behindHint", { behind: String(aheadBehind.behind) })
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 2,
              padding: "0 8px",
              height: 20,
              background: "var(--bg-mute)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {aheadBehind.ahead > 0 && aheadBehind.behind > 0
              ? t("vcs.aheadBehind", {
                  ahead: String(aheadBehind.ahead),
                  behind: String(aheadBehind.behind),
                })
              : aheadBehind.ahead > 0
                ? t("vcs.aheadOnly", { ahead: String(aheadBehind.ahead) })
                : t("vcs.behindOnly", { behind: String(aheadBehind.behind) })}
          </button>
        )}

      {/* Repo-state warning chip — appears during MERGING / REBASING / etc.
       *  Click → ConflictResolutionDialog with current state name. */}
      {branchOwner && repoState.state !== "clean" && (
        <button
          onClick={() =>
            openGitDialog({
              kind: "conflicts",
              workspace: branchOwner,
              state: repoState.state,
            })
          }
          title={t("repoState.click")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "0 8px",
            height: 22,
            background: "rgba(229,83,83,0.16)",
            color: "#e55353",
            border: "1px solid rgba(229,83,83,0.4)",
            borderRadius: 11,
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            letterSpacing: "0.04em",
          }}
        >
          <FiAlertTriangle size={11} />
          <span>{t(repoStateLabelKey(repoState.state))}</span>
          {repoState.conflict_count > 0 && (
            <span
              style={{
                fontWeight: 400,
                opacity: 0.85,
                marginLeft: 2,
              }}
            >
              · {t("repoState.conflicts", { n: String(repoState.conflict_count) })}
            </span>
          )}
        </button>
      )}

      {/* Filename in the middle. */}
      <div
        className="flex items-center justify-center"
        style={{ flex: 1, minWidth: 0, gap: 6, color: "var(--text-soft)" }}
      >
        <span
          style={{
            maxWidth: "60%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </span>
        {dirty && <span style={{ color: "var(--accent)" }}>●</span>}
      </div>

      {/* Right-side action cluster. */}
      <div className="flex items-center" style={{ gap: 2 }}>
        <Button
          variant="ghost"
          size="iconLg"
          title={t("shortcut.nav.gotoAnything")}
          onClick={() => setGotoAnythingOpen(true)}
        >
          <FiSearch size={16} />
        </Button>
        <Button
          variant="ghost"
          size="iconLg"
          title={theme === "dark" ? "Light theme" : "Dark theme"}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <FiSun size={16} /> : <FiMoon size={16} />}
        </Button>
        <Button
          variant="ghost"
          size="iconLg"
          title={t("statusbar.settings")}
          onClick={() => setSettingsOpen(true)}
        >
          <FiSettings size={16} />
        </Button>
      </div>
    </div>
  );
}
