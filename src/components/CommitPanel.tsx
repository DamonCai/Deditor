import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  FiArrowLeft,
  FiCheck,
  FiCheckSquare,
  FiChevronDown,
  FiChevronRight,
  FiFolder,
  FiList,
  FiMinusSquare,
  FiRefreshCw,
  FiRotateCcw,
  FiSettings,
  FiSquare,
} from "react-icons/fi";
import { useEditorStore } from "../store/editor";
import { useT, tStatic } from "../lib/i18n";
import { openCommitDiff, openFileByPath } from "../lib/fileio";
import { refreshGit, gitStatusColor } from "../lib/git";
import { buildGitSubmenu } from "../lib/gitMenu";
import ContextMenu, { type MenuItem } from "./ContextMenu";
import LangIcon from "./LangIcon";
import { logError } from "../lib/logger";
import { chooseAction } from "./ConfirmDialog";

interface GitChange {
  path: string;
  rel: string;
  index_status: string;
  worktree_status: string;
  dominant: string;
}

/** JetBrains "Commit" tool window with directory-tree grouping. Two top-
 *  level sections — Changes (tracked) and Unversioned Files (untracked) —
 *  each rooted under the workspace folder. Folder rows show a tri-state
 *  cumulative checkbox (all/none/indeterminate) that toggles every file
 *  underneath them.
 *
 *  Per-workspace: switching `focusedWorkspace` re-targets the panel. Draft
 *  commit message + amend toggle live in store.commitDrafts/commitAmend so
 *  they persist across panel mounts and (for the message) across app
 *  restarts. */
export default function CommitPanel() {
  const t = useT();
  const workspaces = useEditorStore((s) => s.workspaces);
  const focused = useEditorStore((s) => s.focusedWorkspace);
  const draftMap = useEditorStore((s) => s.commitDrafts);
  const amendMap = useEditorStore((s) => s.commitAmend);
  const uncheckedMap = useEditorStore((s) => s.commitUnchecked);
  const setCommitDraft = useEditorStore((s) => s.setCommitDraft);
  const setCommitAmend = useEditorStore((s) => s.setCommitAmend);
  const setCommitChecked = useEditorStore((s) => s.setCommitChecked);
  const clearCommitUnchecked = useEditorStore((s) => s.clearCommitUnchecked);
  const commitOptions = useEditorStore((s) => s.commitOptions);
  const setCommitOption = useEditorStore((s) => s.setCommitOption);
  const messageHistory = useEditorStore((s) => s.commitMessageHistory);
  const pushCommitMessage = useEditorStore((s) => s.pushCommitMessage);
  const viewMode = useEditorStore((s) => s.commitViewMode);
  const setViewMode = useEditorStore((s) => s.setCommitViewMode);

  const workspace = focused ?? workspaces[0] ?? null;
  const draft = workspace ? draftMap[workspace] ?? "" : "";
  const amend = workspace ? !!amendMap[workspace] : false;
  const opts = workspace ? commitOptions[workspace] ?? {} : {};
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const optionsBtnRef = useRef<HTMLButtonElement>(null);
  const unchecked = useMemo(
    () => new Set(workspace ? uncheckedMap[workspace] ?? [] : []),
    [workspace, uncheckedMap],
  );

  const [changes, setChanges] = useState<GitChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"committing" | "pushing" | null>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const focusVersion = useEditorStore((s) => s.commitFocusVersion);

  // Folders explicitly collapsed by the user — default state is expanded so
  // the tree shows everything on first open. Rebuilds with tree topology, so
  // the keys are dir paths relative to the workspace ("" = workspace root).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapsed = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Re-focus message textarea on Cmd+K / "Commit Directory…" / etc.
  useEffect(() => {
    if (focusVersion === 0) return;
    requestAnimationFrame(() => messageRef.current?.focus());
  }, [focusVersion]);

  const refresh = useCallback(async () => {
    if (!workspace) {
      setChanges([]);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const list = await invoke<GitChange[]>("git_changed_files", { workspace });
      setChanges(list);
    } catch (e) {
      logError("git_changed_files failed", e);
      setErr(String(e));
      setChanges([]);
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  // Split tracked vs untracked, then build a directory tree per section.
  // The tree representation is just a function of `changes` + `unchecked`,
  // so deriving on each render via useMemo keeps state minimal.
  const tracked = useMemo(
    () => changes.filter((c) => c.dominant !== "U"),
    [changes],
  );
  const untracked = useMemo(
    () => changes.filter((c) => c.dominant === "U"),
    [changes],
  );

  const trackedTree = useMemo(
    () => (viewMode === "tree" ? buildTree(tracked) : buildFlat(tracked)),
    [tracked, viewMode],
  );
  const untrackedTree = useMemo(
    () => (viewMode === "tree" ? buildTree(untracked) : buildFlat(untracked)),
    [untracked, viewMode],
  );

  const checkedChanges = useMemo(
    () => changes.filter((c) => !unchecked.has(c.rel)),
    [changes, unchecked],
  );

  const counts = useMemo(() => {
    let added = 0,
      modified = 0,
      deleted = 0,
      untrackedN = 0;
    for (const c of changes) {
      if (c.dominant === "A") added++;
      else if (c.dominant === "D") deleted++;
      else if (c.dominant === "U") untrackedN++;
      else if (c.dominant === "M") modified++;
    }
    return { added, modified, deleted, untracked: untrackedN };
  }, [changes]);

  const noneChecked = checkedChanges.length === 0;

  const setRangeChecked = useCallback(
    (rels: string[], checked: boolean) => {
      if (!workspace) return;
      for (const r of rels) setCommitChecked(workspace, r, checked);
    },
    [workspace, setCommitChecked],
  );

  const onRowClick = useCallback(
    (c: GitChange) => {
      if (!workspace) return;
      void openCommitDiff(
        workspace,
        c.path,
        c.rel,
        c.dominant === "U",
        c.dominant === "D",
      );
    },
    [workspace],
  );

  // Right-click on a file row → JetBrains-style menu. Per-row state is
  // captured in the closure so the menu items act on the right file.
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
  } | null>(null);
  const onRowContextMenu = useCallback(
    (e: React.MouseEvent, c: GitChange) => {
      if (!workspace) return;
      e.preventDefault();
      e.stopPropagation();
      setCtxMenu({
        x: e.clientX,
        y: e.clientY,
        items: buildFileMenu(workspace, c, {
          openDiff: () => onRowClick(c),
          jumpToSource: () => void openFileByPath(c.path),
          commitFile: () => {
            // Focus this single file: uncheck everything else, ensure this
            // one is checked, focus the message textarea so the user can
            // type + click Commit.
            for (const other of changes) {
              setCommitChecked(workspace, other.rel, other.rel === c.rel);
            }
            requestAnimationFrame(() => messageRef.current?.focus());
          },
          rollback: async () => {
            const ok = await chooseAction({
              title: tStatic("commit.row.confirmRollbackTitle"),
              message: tStatic("commit.row.confirmRollbackMsg", { name: c.rel }),
              buttons: [
                { label: tStatic("common.cancel"), value: "cancel" },
                { label: tStatic("commit.rollback"), value: "ok", danger: true },
              ],
            });
            if (ok !== "ok") return;
            try {
              await invoke("git_rollback_paths", {
                workspace,
                paths: [c.rel],
              });
              await refresh();
              refreshGit(workspace);
            } catch (err) {
              setErr(String(err));
            }
          },
          addToVcs: async () => {
            try {
              await invoke("git_stage_paths", {
                workspace,
                paths: [c.rel],
              });
              await refresh();
              refreshGit(workspace);
            } catch (err) {
              setErr(String(err));
            }
          },
          unstage: async () => {
            try {
              await invoke("git_unstage_paths", {
                workspace,
                paths: [c.rel],
              });
              await refresh();
              refreshGit(workspace);
            } catch (err) {
              setErr(String(err));
            }
          },
          addToGitignore: async () => {
            try {
              await appendToGitignore(workspace, c.rel);
              await refresh();
            } catch (err) {
              setErr(
                tStatic("commit.row.gitignoreFail", { err: String(err) }),
              );
            }
          },
          createPatch: () => {
            useEditorStore
              .getState()
              .openGitDialog({ kind: "createPatch", workspace });
          },
          copyPatch: async () => {
            try {
              const patch = await invoke<string>(
                "git_create_patch_for_path",
                { workspace, path: c.rel, staged: false },
              );
              await navigator.clipboard.writeText(patch);
            } catch (err) {
              setErr(String(err));
            }
          },
          deleteFile: async () => {
            const ok = await chooseAction({
              title: tStatic("commit.row.confirmDeleteTitle"),
              message: tStatic("commit.row.confirmDeleteMsg", { name: c.rel }),
              buttons: [
                { label: tStatic("common.cancel"), value: "cancel" },
                { label: tStatic("common.delete"), value: "ok", danger: true },
              ],
            });
            if (ok !== "ok") return;
            try {
              await invoke("delete_path", { path: c.path });
              await refresh();
              refreshGit(workspace);
            } catch (err) {
              setErr(String(err));
            }
          },
        }),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [workspace, changes, setCommitChecked],
  );

  const doCommit = async (alsoPush: boolean) => {
    if (!workspace) return;
    if (busy) return;
    if (!draft.trim() && !amend) {
      setErr(tStatic("commit.toast.fail", { err: "empty message" }));
      return;
    }
    // `--allow-empty` lets us commit with no checked files (tags / hook
    // re-trigger). Otherwise we still require something to be selected.
    if (noneChecked && !amend && !opts.allowEmpty) {
      setErr(tStatic("commit.toast.fail", { err: "no files selected" }));
      return;
    }
    setBusy("committing");
    setErr(null);
    try {
      const paths = checkedChanges.map((c) => c.rel);
      await invoke<string>("git_commit", {
        args: {
          workspace,
          message: draft,
          paths,
          amend,
          signoff: !!opts.signoff,
          allowEmpty: !!opts.allowEmpty,
          author:
            opts.authorOverride && opts.authorOverride.trim().length > 0
              ? opts.authorOverride.trim()
              : null,
        },
      });
      if (alsoPush) {
        setBusy("pushing");
        try {
          await invoke<string>("git_push", { workspace });
        } catch (e) {
          setErr(tStatic("commit.toast.pushFail", { err: String(e) }));
          return;
        }
      }
      // Save into history before clearing the draft so Cmd+↑ can pull it
      // back if the user wants to amend with a tweak.
      pushCommitMessage(draft);
      setHistoryIdx(-1);
      setCommitDraft(workspace, "");
      setCommitAmend(workspace, false);
      clearCommitUnchecked(workspace);
      await refresh();
      refreshGit(workspace);
    } catch (e) {
      setErr(tStatic("commit.toast.fail", { err: String(e) }));
    } finally {
      setBusy(null);
    }
  };

  const onRollback = async () => {
    if (!workspace) return;
    if (checkedChanges.length === 0) return;
    const choice = await chooseAction({
      title: tStatic("commit.rollbackConfirmTitle"),
      message: tStatic("commit.rollbackConfirmMsg", {
        n: String(checkedChanges.length),
      }),
      buttons: [
        { label: tStatic("common.cancel"), value: "cancel" },
        { label: tStatic("commit.rollback"), value: "rollback", danger: true },
      ],
    });
    if (choice !== "rollback") return;
    try {
      await invoke("git_rollback_paths", {
        workspace,
        paths: checkedChanges
          .filter((c) => c.dominant !== "U")
          .map((c) => c.rel),
      });
      await refresh();
      refreshGit(workspace);
    } catch (e) {
      setErr(String(e));
    }
  };

  const wsName = workspace ? shortName(workspace) : "";

  return (
    <div
      className="flex flex-col h-full text-sm select-none"
      style={{ background: "var(--bg-soft)" }}
    >
      {/* Top bar */}
      <div
        className="flex items-center"
        style={{
          height: 32,
          padding: "0 8px",
          borderBottom: "1px solid var(--border)",
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text)",
        }}
      >
        <ToolbarBtn
          onClick={() => useEditorStore.getState().setLeftPanel("files")}
          title={t("commit.backToProject")}
        >
          <FiArrowLeft size={13} />
        </ToolbarBtn>
        <span style={{ flex: 1 }}>{t("commit.title")}</span>
        <ViewModeMenu
          mode={viewMode}
          onChange={setViewMode}
          disabled={!workspace}
        />
        <ToolbarBtn
          onClick={() => void refresh()}
          title={t("commit.refresh")}
          disabled={loading || !workspace}
        >
          <FiRefreshCw size={13} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => void onRollback()}
          title={t("commit.rollback")}
          disabled={!workspace || noneChecked}
        >
          <FiRotateCcw size={13} />
        </ToolbarBtn>
        <button
          ref={optionsBtnRef}
          onClick={() => setOptionsOpen((v) => !v)}
          title={t("commit.options")}
          style={{
            ...iconBtnStyle,
            background: optionsOpen ? "var(--bg-mute)" : "transparent",
          }}
          disabled={!workspace}
        >
          <FiSettings size={13} />
        </button>
      </div>

      {optionsOpen && workspace && (
        <OptionsPopover
          anchor={optionsBtnRef}
          opts={opts}
          onChange={(patch) => setCommitOption(workspace, patch)}
          onClose={() => setOptionsOpen(false)}
        />
      )}

      {/* Filter input row + Workspace switcher removed — file list stays
       *  uncluttered. The funnel icon in the toolbar already toggles
       *  unversioned-files visibility (the more common ask). Workspace
       *  switching happens by clicking another workspace in the FileTree. */}

      {/* Tree */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {!workspace && (
          <div
            style={{
              padding: 16,
              color: "var(--text-soft)",
              fontSize: 12,
            }}
          >
            {t("filetree.emptyHint")}
          </div>
        )}
        {workspace && err && (
          <div
            style={{
              padding: "6px 12px",
              fontSize: 12,
              color: "#e55353",
              background: "rgba(229,83,83,0.08)",
            }}
          >
            {err}
          </div>
        )}
        {workspace && changes.length === 0 && !loading && !err && (
          <div
            style={{
              padding: 16,
              color: "var(--text-soft)",
              fontSize: 12,
            }}
          >
            {t("commit.empty")}
          </div>
        )}
        {workspace && tracked.length > 0 && (
          <Section
            title={t("commit.changes")}
            count={tracked.length}
            sectionKey="__changes__"
            collapsed={collapsed}
            toggleCollapsed={toggleCollapsed}
            tree={trackedTree}
            wsName={wsName}
            unchecked={unchecked}
            setRangeChecked={setRangeChecked}
            onRowClick={onRowClick}
            onRowContextMenu={onRowContextMenu}
            flatMode={viewMode === "flat"}
          />
        )}
        {workspace && untracked.length > 0 && (
          <Section
            title={t("commit.unversioned")}
            count={untracked.length}
            sectionKey="__untracked__"
            collapsed={collapsed}
            toggleCollapsed={toggleCollapsed}
            tree={untrackedTree}
            wsName={wsName}
            unchecked={unchecked}
            setRangeChecked={setRangeChecked}
            onRowClick={onRowClick}
            onRowContextMenu={onRowContextMenu}
            flatMode={viewMode === "flat"}
          />
        )}
      </div>

      {/* Footer summary */}
      {workspace && changes.length > 0 && (
        <div
          style={{
            padding: "4px 12px",
            fontSize: 11,
            color: "var(--text-soft)",
            borderTop: "1px solid var(--border)",
            background: "var(--bg-soft)",
          }}
        >
          {t("commit.summary", {
            added: String(counts.added),
            modified: String(counts.modified),
            deleted: String(counts.deleted),
            untracked: String(counts.untracked),
          })}
        </div>
      )}

      {/* Amend */}
      <div
        className="flex items-center"
        style={{
          padding: "6px 8px 4px",
          gap: 6,
          fontSize: 12,
          color: "var(--text)",
          borderTop: "1px solid var(--border)",
        }}
      >
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            cursor: workspace ? "pointer" : "default",
          }}
        >
          <input
            type="checkbox"
            checked={amend}
            onChange={(e) =>
              workspace && setCommitAmend(workspace, e.target.checked)
            }
            disabled={!workspace}
          />
          {t("commit.amend")}
        </label>
      </div>

      <div style={{ position: "relative", margin: "0 8px 8px" }}>
        <textarea
          ref={messageRef}
          value={draft}
          onChange={(e) =>
            workspace && setCommitDraft(workspace, e.target.value)
          }
          onKeyDown={(e) => {
            // Cmd/Ctrl+↑/↓ cycles message history. Empty history is a
            // no-op. Tracks an index so repeated presses walk further back.
            if ((e.metaKey || e.ctrlKey) && e.key === "ArrowUp") {
              if (messageHistory.length === 0 || !workspace) return;
              e.preventDefault();
              const next = Math.min(historyIdx + 1, messageHistory.length - 1);
              setHistoryIdx(next);
              setCommitDraft(workspace, messageHistory[next]);
            } else if ((e.metaKey || e.ctrlKey) && e.key === "ArrowDown") {
              if (!workspace) return;
              e.preventDefault();
              const next = historyIdx - 1;
              if (next < 0) {
                setHistoryIdx(-1);
                setCommitDraft(workspace, "");
              } else {
                setHistoryIdx(next);
                setCommitDraft(workspace, messageHistory[next]);
              }
            }
          }}
          placeholder={t("commit.messagePlaceholder")}
          disabled={!workspace || busy != null}
          rows={3}
          style={{
            display: "block",
            width: "100%",
            minHeight: 60,
            maxHeight: 200,
            resize: "vertical",
            padding: "6px 8px",
            background: "var(--bg)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 3,
            fontSize: 13,
            fontFamily: "inherit",
            outline: "none",
          }}
        />
        {/* Subject-line column counter — first newline-terminated line is
         *  treated as the subject (50/72 convention). Yellow at >50,
         *  red at >72. Hidden when no draft. */}
        {workspace && draft.length > 0 && (
          <div
            style={{
              position: "absolute",
              bottom: 4,
              right: 8,
              fontSize: 10,
              fontFamily: "monospace",
              color: subjectColor(draft),
              pointerEvents: "none",
              background: "var(--bg)",
              padding: "0 4px",
              borderRadius: 2,
            }}
            title={t("commit.history.hint")}
          >
            {subjectLength(draft)} / 50
          </div>
        )}
      </div>

      <div
        className="flex items-center"
        style={{
          padding: "0 8px 8px",
          gap: 6,
        }}
      >
        <button
          onClick={() => void doCommit(false)}
          disabled={!workspace || busy != null}
          className="deditor-btn"
          data-variant="primary"
          style={{
            background: "var(--accent)",
            color: "#fff",
            border: "1px solid var(--accent)",
            padding: "5px 12px",
            borderRadius: 4,
            fontSize: 12,
            cursor: !workspace || busy != null ? "not-allowed" : "pointer",
            opacity: !workspace || busy != null ? 0.6 : 1,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {busy === "committing" ? (
            <>
              <FiRefreshCw
                size={11}
                style={{ animation: "spin 1s linear infinite" }}
              />
              {t("commit.committing")}
            </>
          ) : (
            <>
              <FiCheck size={11} />
              {t("commit.commit")}
            </>
          )}
        </button>
        <button
          onClick={() => void doCommit(true)}
          disabled={!workspace || busy != null}
          className="deditor-btn"
          data-variant="secondary"
          style={{
            background: "transparent",
            color: "var(--text)",
            border: "1px solid var(--border)",
            padding: "5px 12px",
            borderRadius: 4,
            fontSize: 12,
            cursor: !workspace || busy != null ? "not-allowed" : "pointer",
            opacity: !workspace || busy != null ? 0.6 : 1,
          }}
        >
          {busy === "pushing" ? t("commit.pushing") : t("commit.commitAndPush")}
        </button>
      </div>
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tree types + builder

/** A directory or file node in the changes tree. Files reference their
 *  underlying GitChange; directories carry the cumulative file list of
 *  every descendant so checkbox / status math is one walk down, not a
 *  recursive scan per render. */
interface TreeFile {
  kind: "file";
  rel: string;
  change: GitChange;
}
interface TreeDir {
  kind: "dir";
  /** dir path relative to workspace root, "" for the root dir node. */
  rel: string;
  /** Just the basename for display. */
  name: string;
  children: TreeNode[];
  /** Flat list of every descendant file's rel — used for the cumulative
   *  checkbox toggle without re-walking the subtree. */
  descendantRels: string[];
}
type TreeNode = TreeFile | TreeDir;

/** Group changes into a directory tree. JetBrains compresses single-child
 *  dir chains into one row (e.g. `src/components` shown as a single node),
 *  so we collapse here too. The root (`""`) never collapses. */
function buildTree(changes: GitChange[]): TreeDir {
  const root: TreeDir = {
    kind: "dir",
    rel: "",
    name: "",
    children: [],
    descendantRels: [],
  };
  if (changes.length === 0) return root;
  // Insert each file into the tree at its full path.
  for (const c of changes) {
    const segments = c.rel.split("/").filter(Boolean);
    let cur: TreeDir = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      const dirRel = segments.slice(0, i + 1).join("/");
      let child = cur.children.find(
        (n): n is TreeDir => n.kind === "dir" && n.rel === dirRel,
      );
      if (!child) {
        child = {
          kind: "dir",
          rel: dirRel,
          name: seg,
          children: [],
          descendantRels: [],
        };
        cur.children.push(child);
      }
      cur = child;
    }
    cur.children.push({
      kind: "file",
      rel: c.rel,
      change: c,
    });
  }
  // Collapse single-child dir chains: src → components → ... when each only
  // has one dir child. JetBrains shows `src/components` as one row.
  collapseChain(root);
  // Compute descendantRels by post-order walk.
  computeDescendants(root);
  // Sort: directories before files, alphabetical within.
  sortTree(root);
  return root;
}

/** Flat-mode "tree": one root with every file as a direct child. Used when
 *  the user toggles the panel into "Flat" view — files render with their
 *  full relative path in dim text, no folder nesting. */
function buildFlat(changes: GitChange[]): TreeDir {
  const root: TreeDir = {
    kind: "dir",
    rel: "",
    name: "",
    children: changes.map((c) => ({
      kind: "file" as const,
      rel: c.rel,
      change: c,
    })),
    descendantRels: changes.map((c) => c.rel),
  };
  root.children.sort((a, b) => {
    const ar = a.kind === "file" ? a.rel : (a as TreeDir).rel;
    const br = b.kind === "file" ? b.rel : (b as TreeDir).rel;
    return ar.localeCompare(br);
  });
  return root;
}

function collapseChain(node: TreeNode): void {
  if (node.kind !== "dir") return;
  for (const child of node.children) collapseChain(child);
  // While this dir has exactly one child AND that child is a dir, merge.
  // (Only applied to non-root dirs — keeps the workspace name as its own row.)
  if (node.rel !== "") {
    while (node.children.length === 1 && node.children[0].kind === "dir") {
      const only = node.children[0] as TreeDir;
      node.name = `${node.name}/${only.name}`;
      node.rel = only.rel;
      node.children = only.children;
    }
  }
}

function computeDescendants(node: TreeNode): string[] {
  if (node.kind === "file") return [node.rel];
  const all: string[] = [];
  for (const c of node.children) all.push(...computeDescendants(c));
  node.descendantRels = all;
  return all;
}

function sortTree(node: TreeNode): void {
  if (node.kind !== "dir") return;
  node.children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    const an = a.kind === "dir" ? a.name : (a.rel.split("/").pop() ?? a.rel);
    const bn = b.kind === "dir" ? b.name : (b.rel.split("/").pop() ?? b.rel);
    return an.localeCompare(bn);
  });
  for (const c of node.children) sortTree(c);
}

// ---------------------------------------------------------------------------
// Section + tree row rendering

function Section({
  title,
  count,
  sectionKey,
  collapsed,
  toggleCollapsed,
  tree,
  wsName,
  unchecked,
  setRangeChecked,
  onRowClick,
  onRowContextMenu,
  flatMode,
}: {
  title: string;
  count: number;
  sectionKey: string;
  collapsed: Set<string>;
  toggleCollapsed: (k: string) => void;
  tree: TreeDir;
  wsName: string;
  unchecked: Set<string>;
  setRangeChecked: (rels: string[], checked: boolean) => void;
  onRowClick: (c: GitChange) => void;
  onRowContextMenu: (e: React.MouseEvent, c: GitChange) => void;
  flatMode?: boolean;
}) {
  const t = useT();
  const isCollapsed = collapsed.has(sectionKey);
  const allRels = tree.descendantRels;
  const checkState = computeTriState(allRels, unchecked);

  return (
    <div>
      <div
        onClick={() => toggleCollapsed(sectionKey)}
        className="flex items-center"
        style={{
          padding: "5px 8px",
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
          color: "var(--text)",
          background: "var(--bg-soft)",
          borderBottom: "1px solid var(--border)",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <TriCheck
          state={checkState}
          onClick={(e) => {
            e.stopPropagation();
            // Click cycles: anything other than "all checked" → check all;
            // "all checked" → uncheck all.
            const targetChecked = checkState !== "all";
            setRangeChecked(allRels, targetChecked);
          }}
        />
        {isCollapsed ? (
          <FiChevronRight size={11} style={{ color: "var(--text-soft)" }} />
        ) : (
          <FiChevronDown size={11} style={{ color: "var(--text-soft)" }} />
        )}
        <span>{title}</span>
        <span style={{ color: "var(--text-soft)", fontWeight: 400 }}>
          {t("commit.files", { n: String(count) })}
        </span>
      </div>
      {!isCollapsed && (
        <DirRow
          dir={tree}
          depth={0}
          displayName={wsName}
          collapsed={collapsed}
          toggleCollapsed={toggleCollapsed}
          unchecked={unchecked}
          setRangeChecked={setRangeChecked}
          onRowClick={onRowClick}
          onRowContextMenu={onRowContextMenu}
          isWorkspaceRoot
          flatMode={flatMode}
        />
      )}
    </div>
  );
}

function DirRow({
  dir,
  depth,
  displayName,
  collapsed,
  toggleCollapsed,
  unchecked,
  setRangeChecked,
  onRowClick,
  onRowContextMenu,
  isWorkspaceRoot,
  flatMode,
}: {
  dir: TreeDir;
  depth: number;
  displayName?: string;
  collapsed: Set<string>;
  toggleCollapsed: (k: string) => void;
  unchecked: Set<string>;
  setRangeChecked: (rels: string[], checked: boolean) => void;
  onRowClick: (c: GitChange) => void;
  onRowContextMenu: (e: React.MouseEvent, c: GitChange) => void;
  isWorkspaceRoot?: boolean;
  flatMode?: boolean;
}) {
  const t = useT();
  const open = !collapsed.has(`dir:${dir.rel || "__root__"}`);
  const checkState = computeTriState(dir.descendantRels, unchecked);
  const name = displayName ?? dir.name;

  return (
    <>
      <div
        onClick={() =>
          toggleCollapsed(`dir:${dir.rel || "__root__"}`)
        }
        className="flex items-center"
        style={{
          padding: "3px 8px",
          paddingLeft: 8 + depth * 14,
          gap: 6,
          fontSize: 12,
          color: "var(--text)",
          cursor: "pointer",
          userSelect: "none",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "")}
      >
        <TriCheck
          state={checkState}
          onClick={(e) => {
            e.stopPropagation();
            const targetChecked = checkState !== "all";
            setRangeChecked(dir.descendantRels, targetChecked);
          }}
        />
        {open ? (
          <FiChevronDown size={11} style={{ color: "var(--text-soft)" }} />
        ) : (
          <FiChevronRight size={11} style={{ color: "var(--text-soft)" }} />
        )}
        <FiFolder
          size={12}
          color="#dcb67a"
          style={{ flexShrink: 0 }}
        />
        <span
          style={{
            color: "var(--text)",
            fontWeight: isWorkspaceRoot ? 600 : 400,
          }}
        >
          {name}
        </span>
        <span style={{ color: "var(--text-soft)", fontSize: 11 }}>
          {t("commit.files", { n: String(dir.descendantRels.length) })}
        </span>
      </div>
      {open &&
        dir.children.map((child) =>
          child.kind === "dir" ? (
            <DirRow
              key={`d:${child.rel}`}
              dir={child}
              depth={depth + 1}
              collapsed={collapsed}
              toggleCollapsed={toggleCollapsed}
              unchecked={unchecked}
              setRangeChecked={setRangeChecked}
              onRowClick={onRowClick}
              onRowContextMenu={onRowContextMenu}
              flatMode={flatMode}
            />
          ) : (
            <FileRow
              key={`f:${child.rel}`}
              file={child}
              depth={depth + 1}
              checked={!unchecked.has(child.rel)}
              setRangeChecked={setRangeChecked}
              onClick={onRowClick}
              onContextMenu={onRowContextMenu}
              showDirSuffix={flatMode}
            />
          ),
        )}
    </>
  );
}

interface FileRowProps {
  file: TreeFile;
  depth: number;
  checked: boolean;
  // Stable per-event handlers (parent useCallback'd) — file.change is passed
  // back so the row never has to bind its own closure. Keeps memo effective
  // even when CommitPanel re-renders for unrelated reasons (commit message
  // edits, option toggles, etc.).
  setRangeChecked: (rels: string[], checked: boolean) => void;
  onClick: (c: GitChange) => void;
  onContextMenu: (e: React.MouseEvent, c: GitChange) => void;
  showDirSuffix?: boolean;
}

const FileRow = memo(function FileRow({
  file,
  depth,
  checked,
  setRangeChecked,
  onClick,
  onContextMenu,
  showDirSuffix,
}: FileRowProps) {
  const onToggle = useCallback(
    () => setRangeChecked([file.change.rel], checked),
    [setRangeChecked, file.change.rel, checked],
  );
  const handleClick = useCallback(() => onClick(file.change), [onClick, file.change]);
  const handleCtx = useCallback(
    (e: React.MouseEvent) => onContextMenu(e, file.change),
    [onContextMenu, file.change],
  );
  const c = file.change;
  const dom = c.dominant as "M" | "A" | "D" | "U" | "C" | "?" | "I";
  const color = gitStatusColor(dom) ?? "var(--text)";
  const baseName = c.rel.split("/").pop() ?? c.rel;
  const dirName =
    showDirSuffix && c.rel.includes("/")
      ? c.rel.slice(0, c.rel.lastIndexOf("/"))
      : "";
  return (
    <div
      onClick={handleClick}
      onContextMenu={handleCtx}
      title={c.rel}
      className="flex items-center"
      style={{
        padding: "3px 8px",
        paddingLeft: 8 + depth * 14,
        gap: 6,
        fontSize: 12,
        cursor: "pointer",
        userSelect: "none",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
    >
      <input
        type="checkbox"
        checked={checked}
        onClick={(e) => e.stopPropagation()}
        onChange={onToggle}
        style={{ cursor: "pointer", flexShrink: 0 }}
      />
      <LangIcon filePath={c.path} size={13} />
      <span
        style={{
          color: "var(--text)",
          whiteSpace: "nowrap",
        }}
      >
        {baseName}
      </span>
      {dirName && (
        <span
          className="truncate"
          style={{
            color: "var(--text-soft)",
            fontSize: 11,
            flex: 1,
            minWidth: 0,
          }}
        >
          {dirName}
        </span>
      )}
      <span
        style={{
          marginLeft: dirName ? 0 : "auto",
          color,
          fontFamily: "monospace",
          fontSize: 11,
          width: 14,
          textAlign: "center",
          flexShrink: 0,
        }}
      >
        {c.dominant}
      </span>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Tri-state checkbox

type TriState = "all" | "none" | "some";

function computeTriState(rels: string[], unchecked: Set<string>): TriState {
  if (rels.length === 0) return "none";
  let any = false;
  let all = true;
  for (const r of rels) {
    if (unchecked.has(r)) all = false;
    else any = true;
  }
  if (all) return "all";
  if (any) return "some";
  return "none";
}

function TriCheck({
  state,
  onClick,
}: {
  state: TriState;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      title={state === "all" ? "Uncheck" : "Check"}
      style={{
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: "var(--text)",
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
        padding: 0,
      }}
    >
      {state === "all" ? (
        <FiCheckSquare size={13} />
      ) : state === "some" ? (
        <FiMinusSquare size={13} />
      ) : (
        <FiSquare size={13} />
      )}
    </button>
  );
}

function ViewModeMenu({
  mode,
  onChange,
  disabled,
}: {
  mode: "tree" | "flat";
  onChange: (m: "tree" | "flat") => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  // Popover lives via position:fixed and is NOT a DOM descendant of the
  // button — track it separately so the outside-click handler doesn't
  // close it the moment the user mousedowns on a menu item.
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (popRef.current?.contains(target)) return;
      setOpen(false);
    };
    const id = window.setTimeout(
      () => window.addEventListener("mousedown", onDoc),
      0,
    );
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("mousedown", onDoc);
    };
  }, [open]);
  const rect = btnRef.current?.getBoundingClientRect();
  return (
    <div style={{ position: "relative" }}>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        title={t(mode === "tree" ? "commit.viewTree" : "commit.viewFlat")}
        disabled={disabled}
        style={{
          width: 22,
          height: 22,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: open ? "var(--bg-mute)" : "transparent",
          border: "none",
          borderRadius: 3,
          color: disabled ? "var(--text-soft)" : "var(--text)",
          cursor: disabled ? "default" : "pointer",
          opacity: disabled ? 0.5 : 1,
          gap: 1,
          fontSize: 11,
          padding: 0,
        }}
      >
        <FiList size={13} />
      </button>
      {open && rect && (
        <div
          ref={popRef}
          style={{
            position: "fixed",
            top: rect.bottom + 4,
            right: window.innerWidth - rect.right,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            boxShadow: "var(--shadow-popup)",
            padding: "4px 0",
            minWidth: 160,
            fontSize: 12,
            zIndex: 2000,
          }}
        >
          <ViewItem
            label={t("commit.viewTree")}
            active={mode === "tree"}
            onClick={() => {
              onChange("tree");
              setOpen(false);
            }}
          />
          <ViewItem
            label={t("commit.viewFlat")}
            active={mode === "flat"}
            onClick={() => {
              onChange("flat");
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function ViewItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "5px 12px",
        cursor: "pointer",
        color: "var(--text)",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--hover-bg)")
      }
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
    >
      <span
        style={{
          width: 12,
          color: "var(--accent)",
          fontWeight: 600,
          textAlign: "center",
        }}
      >
        {active ? "✓" : ""}
      </span>
      <span>{label}</span>
    </div>
  );
}

function ToolbarBtn({
  children,
  onClick,
  title,
  disabled,
  pressed,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        width: 22,
        height: 22,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: pressed ? "var(--bg-mute)" : "transparent",
        border: "none",
        borderRadius: 3,
        color: disabled ? "var(--text-soft)" : "var(--text)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled && !pressed)
          e.currentTarget.style.background = "var(--hover-bg)";
      }}
      onMouseLeave={(e) => {
        if (!pressed) e.currentTarget.style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

const iconBtnStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  border: "none",
  borderRadius: 3,
  color: "var(--text)",
  cursor: "pointer",
};

function OptionsPopover({
  anchor,
  opts,
  onChange,
  onClose,
}: {
  anchor: React.RefObject<HTMLButtonElement>;
  opts: { signoff?: boolean; allowEmpty?: boolean; authorOverride?: string };
  onChange: (
    patch: Partial<{
      signoff: boolean;
      allowEmpty: boolean;
      authorOverride: string;
    }>,
  ) => void;
  onClose: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  // Close on outside click / Escape; defer attach so the click that opened
  // us doesn't immediately close us.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchor.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const id = window.setTimeout(() => {
      window.addEventListener("mousedown", onDoc);
      window.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  const rect = anchor.current?.getBoundingClientRect();
  const top = rect ? rect.bottom + 4 : 40;
  const left = rect ? Math.max(8, rect.right - 280) : 8;

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top,
        left,
        width: 280,
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        boxShadow: "var(--shadow-popup)",
        padding: "6px 0",
        zIndex: 2000,
        fontSize: 12,
      }}
    >
      <PopoverToggle
        checked={!!opts.signoff}
        onChange={(v) => onChange({ signoff: v })}
        label={t("commit.options.signoff")}
      />
      <PopoverToggle
        checked={!!opts.allowEmpty}
        onChange={(v) => onChange({ allowEmpty: v })}
        label={t("commit.options.allowEmpty")}
      />
      <div
        style={{
          padding: "6px 12px",
          color: "var(--text)",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <span style={{ color: "var(--text-soft)", fontSize: 11 }}>
          {t("commit.options.author")}
        </span>
        <input
          value={opts.authorOverride ?? ""}
          onChange={(e) => onChange({ authorOverride: e.target.value })}
          placeholder={t("commit.options.authorPlaceholder")}
          style={{
            background: "var(--bg-soft)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            borderRadius: 3,
            padding: "3px 6px",
            fontSize: 12,
            outline: "none",
          }}
        />
      </div>
    </div>
  );
}

function PopoverToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 12px",
        cursor: "pointer",
        color: "var(--text)",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--hover-bg)")
      }
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function shortName(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

/** Length of the commit message's subject (first line). The 50/72 rule
 *  considers anything before the first newline as the subject; we follow. */
function subjectLength(msg: string): number {
  const nl = msg.indexOf("\n");
  return nl < 0 ? msg.length : nl;
}

function subjectColor(msg: string): string {
  const n = subjectLength(msg);
  if (n > 72) return "#e55353";
  if (n > 50) return "#caa54e";
  return "var(--text-soft)";
}

/** Right-click menu items for a single file row in the Commit panel. We
 *  keep JetBrains' visible structure but skip entries that don't map to
 *  plain git (Move to Changelist, Shelve, UML diagram, New Merge Request,
 *  Local History — all JetBrains-only concepts). The Git submenu reuses
 *  the same builder the FileTree uses, so behavior is consistent. */
function buildFileMenu(
  workspace: string,
  c: GitChange,
  handlers: {
    openDiff: () => void;
    jumpToSource: () => void;
    commitFile: () => void;
    rollback: () => void;
    addToVcs: () => void;
    unstage: () => void;
    addToGitignore: () => void;
    createPatch: () => void;
    copyPatch: () => void;
    deleteFile: () => void;
  },
): MenuItem[] {
  const isUntracked = c.dominant === "U";
  const isDeleted = c.dominant === "D";
  return [
    {
      label: tStatic("commit.row.commitFile"),
      onClick: handlers.commitFile,
    },
    {
      label: tStatic("commit.row.rollback"),
      disabled: isUntracked,
      onClick: handlers.rollback,
    },
    { divider: true },
    {
      label: tStatic("commit.row.showDiff"),
      onClick: handlers.openDiff,
    },
    {
      label: tStatic("commit.row.jumpToSource"),
      disabled: isDeleted,
      onClick: handlers.jumpToSource,
    },
    { divider: true },
    {
      label: tStatic("commit.row.addToVcs"),
      // Only meaningful when the file isn't already tracked.
      disabled: !isUntracked,
      onClick: handlers.addToVcs,
    },
    {
      label: tStatic("commit.row.unstage"),
      // Only when something IS in the index for this path.
      disabled: c.index_status.trim() === "" || c.index_status === "?",
      onClick: handlers.unstage,
    },
    {
      label: tStatic("commit.row.addToGitignore"),
      onClick: handlers.addToGitignore,
    },
    { divider: true },
    {
      label: tStatic("commit.row.createPatch"),
      onClick: handlers.createPatch,
    },
    {
      label: tStatic("commit.row.copyPatch"),
      onClick: handlers.copyPatch,
    },
    { divider: true },
    {
      label: tStatic("commit.row.delete"),
      onClick: handlers.deleteFile,
    },
    { divider: true },
    {
      label: tStatic("commit.row.gitSubmenu"),
      submenu: buildGitSubmenu(workspace, c.path),
    },
  ];
}

/** Append a workspace-relative path to .gitignore, creating the file if
 *  it doesn't exist. Idempotent: an already-present line is not duplicated. */
async function appendToGitignore(workspace: string, rel: string): Promise<void> {
  const sep = workspace.includes("\\") && !workspace.includes("/") ? "\\" : "/";
  const path = workspace.endsWith(sep)
    ? `${workspace}.gitignore`
    : `${workspace}${sep}.gitignore`;
  let existing = "";
  try {
    existing = await invoke<string>("read_text_file", { path });
  } catch {
    /* file doesn't exist; we'll create it */
  }
  const lines = existing.split(/\r?\n/);
  if (lines.some((l) => l.trim() === rel)) return;
  const next = (existing.endsWith("\n") || existing.length === 0
    ? existing
    : existing + "\n") + rel + "\n";
  await invoke("write_text_file", { path, content: next });
}
