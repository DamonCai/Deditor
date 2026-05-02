import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "../store/editor";
import { getTerminalHandle } from "../components/Terminal";
import { promptInput } from "../components/PromptDialog";
import { chooseAction } from "../components/ConfirmDialog";
import { openFileByPath } from "./fileio";
import { refreshGit, refreshGitAll, requestBranchPopover, workspaceOf } from "./git";
import { tStatic } from "./i18n";
import type { MenuItem } from "../components/ContextMenu";

interface UpdateProjectResult {
  workspace: string;
  ok: boolean;
  output: string;
}

/** Soft-reset HEAD^ — surfaced via the Git submenu's "Undo Last Commit". */
async function fetch_undo(workspace: string): Promise<void> {
  await invoke("git_undo_last_commit", { workspace });
}

/** Pull every open workspace via `git pull --ff-only`. Surfaces a single
 *  alert summarizing successes vs failures (a future "Update Info" panel
 *  could render this nicer; alert() is the path of least dependency). */
async function runUpdateProject(): Promise<void> {
  const workspaces = useEditorStore.getState().workspaces;
  if (workspaces.length === 0) return;
  try {
    const results = await invoke<UpdateProjectResult[]>("git_update_project", {
      workspaces,
    });
    refreshGitAll(workspaces);
    const ok = results.filter((r) => r.ok).length;
    const fail = results.length - ok;
    const summary =
      fail === 0
        ? tStatic("updateProject.success", { n: String(ok) })
        : `${tStatic("updateProject.partial", {
            ok: String(ok),
            fail: String(fail),
          })}\n\n${results
            .filter((r) => !r.ok)
            .map((r) => `${shortPath(r.workspace)}: ${r.output}`)
            .join("\n")}`;
    // eslint-disable-next-line no-alert
    alert(summary);
  } catch (e) {
    // eslint-disable-next-line no-alert
    alert(String(e));
  }
}

function shortPath(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p;
}

/** Build the JetBrains-style Git submenu for the file tree's right-click
 *  context menu. Most actions just compose a `git ...` invocation and paste
 *  it into a workspace-scoped terminal (consistent with the BranchPopover's
 *  philosophy — keeps git logic out of the app, lets the user audit / Ctrl+C
 *  before things commit).
 *
 *  `targetPath` may be the workspace root itself (folder/workspace right-
 *  click) or a file inside it. Path-relative commands quote the path
 *  relative to the workspace; non-path-scoped commands ignore it. */
export function buildGitSubmenu(
  workspace: string,
  targetPath: string,
): MenuItem[] {
  const rel = relativePath(workspace, targetPath);
  const isWorkspace = rel === "." || rel === "";

  return [
    {
      label: tStatic("gitMenu.commit"),
      onClick: () => {
        // Refocus the workspace so CommitPanel queries the right repo, then
        // open the panel + focus the message textarea (mirrors what Cmd+K
        // does — JetBrains parity).
        const store = useEditorStore.getState();
        store.setFocusedWorkspace(workspace);
        store.openCommitPanel();
      },
      shortcut: "⌘K",
    },
    {
      label: tStatic("gitMenu.add"),
      onClick: () =>
        runInWorkspaceTerminal(workspace, `git add ${quote(rel)}\n`),
      shortcut: "⌘A",
    },
    {
      label: tStatic("gitMenu.editIgnore"),
      onClick: () => {
        const sep = workspace.includes("\\") && !workspace.includes("/") ? "\\" : "/";
        const path = workspace.endsWith(sep)
          ? `${workspace}.git${sep}info${sep}exclude`
          : `${workspace}${sep}.git${sep}info${sep}exclude`;
        void openFileByPath(path).catch(() => {
          /* file may not exist; nothing better we can do without prompting */
        });
      },
    },
    { divider: true },
    {
      label: tStatic("gitMenu.annotate"),
      // git blame on a directory makes no sense — disable for workspace/folder.
      disabled: isWorkspace,
      onClick: () =>
        runInWorkspaceTerminal(workspace, `git blame ${quote(rel)}\n`),
    },
    {
      label: tStatic("gitMenu.showDiff"),
      onClick: () =>
        runInWorkspaceTerminal(workspace, `git diff -- ${quote(rel)}\n`),
    },
    {
      label: tStatic("gitMenu.compareRevision"),
      onClick: async () => {
        const ref = await promptInput({
          title: tStatic("gitMenu.compareRevisionTitle"),
          label: tStatic("gitMenu.refPlaceholder"),
          placeholder: "HEAD~1",
          initial: "HEAD~1",
        });
        if (!ref) return;
        runInWorkspaceTerminal(
          workspace,
          `git diff ${ref} -- ${quote(rel)}\n`,
        );
      },
    },
    {
      label: tStatic("gitMenu.compareBranch"),
      onClick: async () => {
        const branch = await promptInput({
          title: tStatic("gitMenu.compareBranchTitle"),
          label: tStatic("gitMenu.branchPlaceholder"),
          placeholder: "main",
        });
        if (!branch) return;
        runInWorkspaceTerminal(
          workspace,
          `git diff ${branch} -- ${quote(rel)}\n`,
        );
      },
    },
    {
      label: tStatic("gitMenu.showHistory"),
      onClick: () => {
        // Open the Git Log tab pre-filtered to this path (workspace-level
        // entries pass undefined → no path filter, showing the full log).
        useEditorStore.getState().openLogTab({
          workspace,
          initialPath: isWorkspace ? undefined : rel,
        });
      },
    },
    {
      label: tStatic("gitMenu.showCurrentRevision"),
      disabled: isWorkspace,
      onClick: () =>
        runInWorkspaceTerminal(
          workspace,
          `git log -1 --format=fuller -- ${quote(rel)}\n`,
        ),
    },
    {
      label: tStatic("gitMenu.rollback"),
      onClick: async () => {
        const choice = await chooseAction({
          title: tStatic("gitMenu.rollbackTitle"),
          message: tStatic("gitMenu.rollbackMsg", { path: rel }),
          buttons: [
            { label: tStatic("common.cancel"), value: "cancel" },
            {
              label: tStatic("gitMenu.rollback"),
              value: "rollback",
              danger: true,
            },
          ],
        });
        if (choice !== "rollback") return;
        runInWorkspaceTerminal(
          workspace,
          `git checkout HEAD -- ${quote(rel)}\n`,
        );
      },
      shortcut: "⌘Z",
    },
    { divider: true },
    {
      label: tStatic("gitMenu.push"),
      onClick: () =>
        useEditorStore.getState().openGitDialog({ kind: "push", workspace }),
      shortcut: "⇧⌘K",
    },
    {
      label: tStatic("gitMenu.pull"),
      onClick: () => runInWorkspaceTerminal(workspace, `git pull\n`),
    },
    {
      label: tStatic("gitMenu.fetch"),
      onClick: () => runInWorkspaceTerminal(workspace, `git fetch\n`),
    },
    { divider: true },
    {
      label: tStatic("gitMenu.merge"),
      onClick: async () => {
        const branch = await promptInput({
          title: tStatic("gitMenu.mergeTitle"),
          label: tStatic("gitMenu.branchPlaceholder"),
        });
        if (!branch) return;
        runInWorkspaceTerminal(workspace, `git merge ${branch}\n`);
      },
    },
    {
      label: tStatic("gitMenu.rebase"),
      onClick: async () => {
        const ref = await promptInput({
          title: tStatic("gitMenu.rebaseTitle"),
          label: tStatic("gitMenu.refPlaceholder"),
        });
        if (!ref) return;
        runInWorkspaceTerminal(workspace, `git rebase ${ref}\n`);
      },
    },
    { divider: true },
    {
      label: tStatic("gitMenu.branches"),
      onClick: () => requestBranchPopover(workspace),
    },
    {
      label: tStatic("gitMenu.newBranch"),
      onClick: async () => {
        const name = await promptInput({
          title: tStatic("git.prompt.newBranchTitle"),
          placeholder: tStatic("git.prompt.branchNamePlaceholder"),
        });
        if (!name) return;
        runInWorkspaceTerminal(workspace, `git checkout -b ${name}\n`);
      },
    },
    {
      label: tStatic("gitMenu.newTag"),
      onClick: () =>
        useEditorStore.getState().openGitDialog({ kind: "tags", workspace }),
    },
    {
      label: tStatic("gitMenu.resetHead"),
      onClick: () =>
        useEditorStore
          .getState()
          .openGitDialog({ kind: "resetHead", workspace }),
    },
    { divider: true },
    {
      label: tStatic("gitMenu.stashChanges"),
      onClick: () =>
        useEditorStore.getState().openGitDialog({ kind: "stash", workspace }),
    },
    {
      label: tStatic("gitMenu.unstashChanges"),
      // JetBrains routes this to the same Stash list dialog; we follow.
      onClick: () =>
        useEditorStore.getState().openGitDialog({ kind: "stash", workspace }),
    },
    { divider: true },
    {
      label: tStatic("gitMenu.undoLastCommit"),
      onClick: async () => {
        const choice = await chooseAction({
          title: tStatic("gitMenu.undoLastCommitTitle"),
          message: tStatic("gitMenu.undoLastCommitMsg"),
          buttons: [
            { label: tStatic("common.cancel"), value: "cancel" },
            { label: tStatic("gitMenu.undoLastCommit"), value: "ok", danger: true },
          ],
        });
        if (choice !== "ok") return;
        try {
          await fetch_undo(workspace);
          refreshGit(workspace);
        } catch (e) {
          // eslint-disable-next-line no-alert
          alert(String(e));
        }
      },
    },
    {
      label: tStatic("gitMenu.updateProject"),
      onClick: () => void runUpdateProject(),
    },
    { divider: true },
    {
      label: tStatic("gitMenu.createPatch"),
      onClick: () =>
        useEditorStore
          .getState()
          .openGitDialog({ kind: "createPatch", workspace }),
    },
    {
      label: tStatic("gitMenu.applyPatch"),
      onClick: () =>
        useEditorStore
          .getState()
          .openGitDialog({ kind: "applyPatch", workspace }),
    },
    { divider: true },
    {
      label: tStatic("gitMenu.manageRemotes"),
      onClick: () =>
        useEditorStore.getState().openGitDialog({ kind: "remotes", workspace }),
    },
    {
      label: tStatic("gitMenu.clone"),
      onClick: () => useEditorStore.getState().openGitDialog({ kind: "clone" }),
    },
  ];
}

/** Convenience wrapper for callers that have just a path: figures out its
 *  workspace, falls back to the first workspace; returns null when neither
 *  applies (no workspace open at all → no Git submenu). */
export function gitSubmenuForPath(
  targetPath: string,
): { workspace: string; items: MenuItem[] } | null {
  const workspaces = useEditorStore.getState().workspaces;
  const workspace =
    workspaceOf(targetPath, workspaces) ?? workspaces[0] ?? null;
  if (!workspace) return null;
  return { workspace, items: buildGitSubmenu(workspace, targetPath) };
}

// ---------------------------------------------------------------------------
// helpers

function relativePath(workspace: string, target: string): string {
  if (target === workspace) return ".";
  const sep =
    workspace.includes("\\") && !workspace.includes("/") ? "\\" : "/";
  const prefix = workspace.endsWith(sep) ? workspace : workspace + sep;
  return target.startsWith(prefix) ? target.slice(prefix.length) : target;
}

/** Shell-safe path argument. Handles spaces / quotes / backslashes well
 *  enough for typical project paths; not bulletproof for adversarial input
 *  but the input here is the user's own filesystem. */
function quote(p: string): string {
  if (p === "." || p === "") return ".";
  if (/^[A-Za-z0-9._\-/\\]+$/.test(p)) return p;
  return `"${p.replace(/(["\\$`])/g, "\\$1")}"`;
}

/** Open (or focus an existing) terminal session for this workspace, then
 *  paste the command. Mirrors BranchPopover's runInTerminal — including the
 *  delayed git refresh so the StatusBar branch label / file decorations
 *  update after slow `git pull` etc. */
function runInWorkspaceTerminal(workspace: string, command: string): void {
  const store = useEditorStore.getState();
  store.openTerminalForWorkspace(workspace);
  requestAnimationFrame(() => {
    const h = getTerminalHandle();
    if (h) h.paste(command);
    window.setTimeout(() => refreshGit(workspace), 1500);
  });
}

