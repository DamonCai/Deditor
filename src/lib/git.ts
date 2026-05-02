import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { logWarn } from "./logger";

/** Single-letter git status code as surfaced by `git_status`. The Rust side
 *  collapses porcelain XY to one dominant char so the file tree shows at
 *  most one badge per row.
 *
 *  - M  modified (working tree or index)
 *  - A  added / staged
 *  - U  untracked
 *  - D  deleted
 *  - C  conflict (unmerged)
 *  - I  ignored (we don't query for these but be safe)
 *  - ?  unknown / unhandled */
export type GitStatusCode = "M" | "A" | "D" | "U" | "C" | "?" | "I";

interface GitStatusEntry {
  path: string;
  status: GitStatusCode;
}

interface BranchList {
  current: string;
  local: string[];
  remote: string[];
}

interface GitState {
  /** workspace path → branch name (empty string = not a git repo) */
  branches: Record<string, string>;
  /** absolute file path → status code */
  statuses: Record<string, GitStatusCode>;
  /** workspace path → list of recent branch names (popover cache) */
  recentBranches: Record<string, string[]>;
  /** workspace path → full local + remote branch list (popover cache).
   *  Refreshed on the same throttle as branches/statuses. */
  branchLists: Record<string, BranchList>;
}

const useGitStore = create<GitState>(() => ({
  branches: {},
  statuses: {},
  recentBranches: {},
  branchLists: {},
}));

// Throttle: coalesce rapid refresh requests onto one execution per workspace.
// This matters for the save → focus → terminal-Enter chain that can fire
// within hundreds of ms of each other.
const pendingRefresh = new Map<string, ReturnType<typeof setTimeout>>();
const inFlight = new Set<string>();
const REFRESH_DEBOUNCE_MS = 250;
const REFRESH_TIMEOUT_MS = 2000;

/** Refresh status + branch for one workspace. Coalesces rapid calls; bails
 *  out silently when not in a git repo. Single workspace can have at most
 *  one in-flight refresh; queued calls collapse onto the next firing. */
export function refreshGit(workspace: string): void {
  if (!workspace) return;
  // Coalesce: cancel pending, schedule one.
  const prev = pendingRefresh.get(workspace);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    pendingRefresh.delete(workspace);
    void doRefresh(workspace);
  }, REFRESH_DEBOUNCE_MS);
  pendingRefresh.set(workspace, t);
}

async function doRefresh(workspace: string): Promise<void> {
  if (inFlight.has(workspace)) {
    // Re-queue once after current call lands so we don't lose a notification.
    setTimeout(() => refreshGit(workspace), 50);
    return;
  }
  inFlight.add(workspace);
  try {
    const branchP = invoke<string>("git_branch", { workspace });
    const entriesP = invoke<GitStatusEntry[]>("git_status", { workspace });
    const recentP = invoke<string[]>("git_recent_branches", { workspace });
    const listP = invoke<BranchList>("git_list_branches", { workspace });
    const [branch, entries, recent, list] = await withTimeout(
      Promise.all([branchP, entriesP, recentP, listP]),
      REFRESH_TIMEOUT_MS,
    );
    useGitStore.setState((s) => {
      // Drop stale entries that lived under this workspace; keep entries
      // belonging to other workspaces intact.
      const fresh: Record<string, GitStatusCode> = {};
      for (const [p, code] of Object.entries(s.statuses)) {
        if (!isUnder(p, workspace)) fresh[p] = code;
      }
      for (const e of entries) fresh[e.path] = e.status;
      return {
        branches: { ...s.branches, [workspace]: branch },
        recentBranches: { ...s.recentBranches, [workspace]: recent },
        branchLists: { ...s.branchLists, [workspace]: list },
        statuses: fresh,
      };
    });
  } catch (err) {
    logWarn(`git refresh failed for ${workspace}`, err);
  } finally {
    inFlight.delete(workspace);
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("git refresh timed out")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      },
    );
  });
}

function isUnder(child: string, parent: string): boolean {
  return (
    child === parent ||
    child.startsWith(parent + "/") ||
    child.startsWith(parent + "\\")
  );
}

export function refreshGitAll(workspaces: string[]): void {
  for (const w of workspaces) refreshGit(w);
}

/** Hook: subscribe to a single file's git status. Returns null when no
 *  status is recorded (clean / unknown / not in repo). */
export function useFileGitStatus(path: string | null): GitStatusCode | null {
  return useGitStore((s) => (path ? s.statuses[path] ?? null : null));
}

export function useGitBranch(workspace: string | null): string {
  return useGitStore((s) => (workspace ? s.branches[workspace] ?? "" : ""));
}

export function useRecentBranches(workspace: string | null): string[] {
  return useGitStore((s) =>
    workspace ? s.recentBranches[workspace] ?? [] : [],
  );
}

export function useBranchList(workspace: string | null): BranchList {
  return useGitStore((s) =>
    workspace
      ? s.branchLists[workspace] ?? { current: "", local: [], remote: [] }
      : { current: "", local: [], remote: [] },
  );
}

// ---------------------------------------------------------------------------
// Branch popover request bus
//
// The Git context menu (`Branches…`) needs to open the StatusBar's branch
// popover from far away. Plumbing a ref through every caller is noisy; a
// tiny pub/sub keeps the StatusBar in charge of rendering the popover but
// lets anyone trigger it.

type BranchPopoverListener = (workspace: string) => void;
const branchPopoverListeners = new Set<BranchPopoverListener>();

export function requestBranchPopover(workspace: string): void {
  for (const fn of branchPopoverListeners) {
    try {
      fn(workspace);
    } catch {
      /* listener errors shouldn't break the bus */
    }
  }
}

export function onBranchPopoverRequest(fn: BranchPopoverListener): () => void {
  branchPopoverListeners.add(fn);
  return () => branchPopoverListeners.delete(fn);
}

// ---------------------------------------------------------------------------
// Git Log (Phase 2)
//
// Each log result lives in its own short-lived state, NOT in useGitStore —
// the log can be tens of thousands of commits and isn't shared with the
// per-workspace branch cache. Components fetch via fetchGitLog() and own
// the result lifecycle.

export interface GitCommit {
  hash: string;
  short_hash: string;
  parents: string[];
  author_name: string;
  author_email: string;
  author_date: number; // unix seconds
  committer_name: string;
  committer_date: number;
  subject: string;
  body: string;
  /** Symbolic refs attached to this commit (e.g. "HEAD -> main",
   *  "origin/main", "tag: v1.0"). The frontend can split on " -> " to
   *  identify the active head. */
  refs: string[];
}

export interface GitLogFilters {
  /** Refs to traverse. Empty array → `--all`. */
  revs?: string[];
  grep?: string;
  author?: string;
  since?: string;
  until?: string;
  /** Restrict to commits touching this path (workspace-relative). Drives
   *  "Show File History" — same panel, just with path pre-filled. */
  path?: string;
  limit?: number;
  skip?: number;
}

export async function fetchGitLog(
  workspace: string,
  filters: GitLogFilters = {},
): Promise<GitCommit[]> {
  return invoke<GitCommit[]>("git_log", {
    args: { workspace, ...filters },
  });
}

export interface GitCommitFile {
  rel: string;
  status: string; // 'A' / 'M' / 'D' / 'R' / 'C' / 'T' / 'U'
  old_rel: string | null;
  additions: number;
  deletions: number;
}

export async function fetchCommitFiles(
  workspace: string,
  hash: string,
): Promise<GitCommitFile[]> {
  return invoke<GitCommitFile[]>("git_commit_files", { workspace, hash });
}

export async function fetchFileAt(
  workspace: string,
  rev: string,
  path: string,
): Promise<string> {
  return invoke<string>("git_show_at", { workspace, rev, path });
}

/** Fire-and-forget background fetch for one workspace. Errors swallowed
 *  silently — there's no useful UI we can show for "the network was flaky"
 *  on a 5-minute timer. The next refresh tick will pick up new state. */
export async function backgroundFetch(workspace: string): Promise<void> {
  try {
    await invoke("git_fetch_silent", { workspace });
    // After a successful fetch, the per-workspace branch / status caches
    // may be stale. Schedule a refresh.
    refreshGit(workspace);
  } catch {
    /* offline / no remote — fine */
  }
}

/** Find the deepest workspace prefix that owns a given file path. */
export function workspaceOf(
  path: string | null,
  workspaces: string[],
): string | null {
  if (!path) return null;
  let best: string | null = null;
  for (const w of workspaces) {
    if (isUnder(path, w)) {
      if (!best || w.length > best.length) best = w;
    }
  }
  return best;
}

/** Color a git status code maps to. Returns null for clean / null statuses
 *  so callers can fall back to default text color without a default branch. */
export function gitStatusColor(code: GitStatusCode | null): string | null {
  switch (code) {
    case "M":
      return "var(--accent)"; // JB modified blue
    case "A":
    case "U":
      return "#5FAF5F"; // JB added/untracked green
    case "D":
      return "#E55353"; // JB deleted red
    case "C":
      return "#E0903F"; // JB conflict orange
    default:
      return null;
  }
}
