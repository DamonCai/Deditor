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

interface GitState {
  /** workspace path → branch name (empty string = not a git repo) */
  branches: Record<string, string>;
  /** absolute file path → status code */
  statuses: Record<string, GitStatusCode>;
  /** workspace path → list of recent branch names (popover cache) */
  recentBranches: Record<string, string[]>;
}

const useGitStore = create<GitState>(() => ({
  branches: {},
  statuses: {},
  recentBranches: {},
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
    const [branch, entries, recent] = await withTimeout(
      Promise.all([branchP, entriesP, recentP]),
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
