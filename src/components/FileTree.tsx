import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEditorStore } from "../store/editor";
import {
  compareWithHead,
  createDir,
  createFile,
  deletePath,
  listDir,
  openFileByPath,
  openFolder,
  openCompare,
  renamePath,
  revealInFinder,
  setWorkspaceByPath,
  type DirEntry,
} from "../lib/fileio";
import { onRefresh } from "../lib/treeRefresh";
import LangIcon from "./LangIcon";
import ContextMenu, { type MenuItem } from "./ContextMenu";
import { promptInput } from "./PromptDialog";
import { confirmDelete } from "./ConfirmDialog";
import { logError } from "../lib/logger";
import { useT, tStatic } from "../lib/i18n";
import { FiFolder, FiFolderPlus, FiChevronsLeft } from "react-icons/fi";
import { Button } from "./ui/Button";
import { useFileGitStatus, gitStatusColor, workspaceOf } from "../lib/git";
import { buildGitSubmenu } from "../lib/gitMenu";
import { invoke } from "@tauri-apps/api/core";

const FOLDER_COLOR = "#dcb67a"; // soft amber, matches VSCode default folder icon
const ROW_HEIGHT = 22;

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

interface DirCacheEntry {
  /** null while listDir is in flight; populated once it resolves. */
  entries: DirEntry[] | null;
  error: string | null;
}

// Flat row types — what the virtualizer renders one of per visible slot.
// Building a flat list (instead of recursive components) is the prerequisite
// for virtualization; @tanstack/react-virtual needs to know each row's
// height, so we collapse the tree into an ordered list and render only the
// rows that fall in the viewport.
type FlatRow =
  | { kind: "workspace"; path: string; depth: 0; open: boolean }
  | { kind: "dir"; path: string; name: string; workspace: string | null; depth: number; open: boolean }
  | { kind: "file"; path: string; name: string; workspace: string | null; depth: number }
  | { kind: "loading"; key: string; depth: number }
  | { kind: "empty"; key: string; depth: number }
  | { kind: "error"; key: string; depth: number; msg: string };

function buildFlatRows(
  workspaces: string[],
  expandedDirs: Record<string, boolean>,
  dirCache: Map<string, DirCacheEntry>,
): FlatRow[] {
  const rows: FlatRow[] = [];
  const walk = (path: string, workspace: string | null, depth: number) => {
    const cache = dirCache.get(path);
    if (!cache) {
      rows.push({ kind: "loading", key: `${path}::loading`, depth });
      return;
    }
    if (cache.error) {
      rows.push({ kind: "error", key: `${path}::err`, depth, msg: cache.error });
      return;
    }
    const entries = cache.entries;
    if (entries === null) {
      rows.push({ kind: "loading", key: `${path}::loading`, depth });
      return;
    }
    if (entries.length === 0) {
      rows.push({ kind: "empty", key: `${path}::empty`, depth });
      return;
    }
    for (const e of entries) {
      if (e.is_dir) {
        const open = expandedDirs[e.path] === true;
        rows.push({
          kind: "dir",
          path: e.path,
          name: e.name,
          workspace,
          depth,
          open,
        });
        if (open) walk(e.path, workspace, depth + 1);
      } else {
        rows.push({
          kind: "file",
          path: e.path,
          name: e.name,
          workspace,
          depth,
        });
      }
    }
  };

  for (const w of workspaces) {
    // Workspace roots default to expanded; only honor an explicit `false`.
    const open = expandedDirs[w] !== false;
    rows.push({ kind: "workspace", path: w, depth: 0, open });
    if (open) walk(w, w, 1);
  }
  return rows;
}

export default function FileTree() {
  const t = useT();
  const workspaces = useEditorStore((s) => s.workspaces);
  const expandedDirs = useEditorStore((s) => s.expandedDirs);
  const removeWorkspace = useEditorStore((s) => s.removeWorkspace);
  const toggleSidebar = useEditorStore((s) => s.toggleSidebar);
  const compareMarkPath = useEditorStore((s) => s.compareMarkPath);
  const setCompareMarkPath = useEditorStore((s) => s.setCompareMarkPath);
  const focusAndExpand = useEditorStore((s) => s.focusAndExpand);

  const [pathInput, setPathInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);

  // Centralized directory cache. Replaces the per-Folder useState that lived
  // in the old recursive tree. Lives at the FileTree root because the flat
  // row builder needs visibility across all directories.
  const [dirCache, setDirCache] = useState<Map<string, DirCacheEntry>>(
    () => new Map(),
  );

  // Compute which directory paths should currently be "loaded" — workspaces
  // (when their expansion isn't explicitly false) and any expanded sub-dir.
  // Anything not in dirCache gets fetched via the next effect.
  const neededPaths = useMemo(() => {
    const needed = new Set<string>();
    const visit = (path: string) => {
      const cache = dirCache.get(path);
      if (!cache?.entries) return;
      for (const e of cache.entries) {
        if (e.is_dir && expandedDirs[e.path] === true) {
          needed.add(e.path);
          visit(e.path);
        }
      }
    };
    for (const w of workspaces) {
      if (expandedDirs[w] !== false) {
        needed.add(w);
        visit(w);
      }
    }
    return needed;
  }, [workspaces, expandedDirs, dirCache]);

  // Fetch listings for any needed path not yet in the cache. The cache
  // updates trigger this effect again, but the in-flight guard ensures we
  // only kick off one request per path.
  useEffect(() => {
    for (const p of neededPaths) {
      if (dirCache.has(p)) continue;
      // Insert a loading placeholder synchronously so we don't re-issue
      // listDir before the response arrives.
      setDirCache((c) => {
        if (c.has(p)) return c;
        const next = new Map(c);
        next.set(p, { entries: null, error: null });
        return next;
      });
      listDir(p).then(
        (list) => {
          setDirCache((c) => {
            const next = new Map(c);
            next.set(p, { entries: list, error: null });
            return next;
          });
        },
        (err) => {
          setDirCache((c) => {
            const next = new Map(c);
            next.set(p, { entries: null, error: String(err) });
            return next;
          });
        },
      );
    }
  }, [neededPaths, dirCache]);

  // External invalidation (rename / delete / git refresh, etc.). Drop the
  // cache for the changed path so the next render's effect re-fetches.
  useEffect(() => {
    return onRefresh((p) => {
      setDirCache((c) => {
        if (!c.has(p)) return c;
        const next = new Map(c);
        next.delete(p);
        return next;
      });
    });
  }, []);

  const flatRows = useMemo(
    () => buildFlatRows(workspaces, expandedDirs, dirCache),
    [workspaces, expandedDirs, dirCache],
  );

  const submit = async () => {
    const p = pathInput.trim();
    if (!p) return;
    setBusy(true);
    setError(null);
    try {
      await setWorkspaceByPath(p);
      setPathInput("");
    } catch (e) {
      setError(typeof e === "string" ? e : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openMenu = useCallback((e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  }, []);

  const handleWorkspaceContextMenu = useCallback(
    (e: React.MouseEvent, w: string) => {
      openMenu(e, [
        { label: t("filetree.newFileInWs"), onClick: () => promptCreate("file", w) },
        { label: t("filetree.newDirInWs"), onClick: () => promptCreate("dir", w) },
        { divider: true },
        { label: t("filetree.revealInFinder"), onClick: () => revealInFinder(w) },
        { divider: true },
        { label: t("gitMenu.root"), submenu: buildGitSubmenu(w, w) },
        { divider: true },
        {
          label: t("filetree.removeFromWs", { name: shortName(w) }),
          onClick: () => removeWorkspace(w),
        },
      ]);
    },
    [openMenu, removeWorkspace, t],
  );

  const handleFolderContextMenu = useCallback(
    (e: React.MouseEvent, dir: string) => {
      const ws = workspaceOf(dir, workspaces) ?? workspaces[0] ?? dir;
      openMenu(e, [
        { label: t("filetree.newFile"), onClick: () => promptCreate("file", dir) },
        { label: t("filetree.newDir"), onClick: () => promptCreate("dir", dir) },
        { divider: true },
        { label: t("filetree.revealInFinder"), onClick: () => revealInFinder(dir) },
        { divider: true },
        { label: t("gitMenu.root"), submenu: buildGitSubmenu(ws, dir) },
        { divider: true },
        { label: t("filetree.renameDir"), onClick: () => promptRename(dir, true) },
        { label: t("filetree.deleteDir"), onClick: () => promptDelete(dir, true) },
      ]);
    },
    [openMenu, t, workspaces],
  );

  const handleFileContextMenu = useCallback(
    (e: React.MouseEvent, file: string) => {
      const marked = compareMarkPath;
      const ws = workspaceOf(file, workspaces);
      const items: MenuItem[] = [
        { label: t("filetree.revealInFinder"), onClick: () => revealInFinder(file) },
        { divider: true },
      ];
      if (marked && marked !== file) {
        items.push({
          label: t("filetree.compareWithSelected", {
            name: marked.split(/[\\/]/).pop() ?? marked,
          }),
          onClick: () => void openCompare(marked, file),
        });
      }
      items.push(
        marked === file
          ? {
              label: t("filetree.unmarkForCompare"),
              onClick: () => setCompareMarkPath(null),
            }
          : {
              label: t("filetree.selectForCompare"),
              onClick: () => setCompareMarkPath(file),
            },
      );
      if (ws) {
        items.push(
          { divider: true },
          {
            label: t("git.menu.compareHead"),
            onClick: () => void compareWithHead(ws, file),
          },
          {
            label: t("git.menu.copyRelpath"),
            onClick: () => {
              invoke<string>("git_repo_relpath", { workspace: ws, path: file })
                .then((p) => navigator.clipboard.writeText(p))
                .catch(() => {});
            },
          },
          { label: t("gitMenu.root"), submenu: buildGitSubmenu(ws, file) },
        );
      }
      items.push(
        { divider: true },
        { label: t("filetree.renameFile"), onClick: () => promptRename(file, false) },
        { label: t("filetree.deleteFile"), onClick: () => promptDelete(file, false) },
      );
      openMenu(e, items);
    },
    [compareMarkPath, openMenu, setCompareMarkPath, t, workspaces],
  );

  // Single onClick router for the row container — dispatches to focusAndExpand
  // for headers/dirs and openFileByPath for files. Stable across renders so
  // memo'd row renderers don't see new function refs.
  const handleWorkspaceClick = useCallback(
    (path: string, open: boolean) => focusAndExpand(path, path, !open),
    [focusAndExpand],
  );
  const handleDirClick = useCallback(
    (path: string, workspace: string | null, open: boolean) =>
      focusAndExpand(path, workspace, !open),
    [focusAndExpand],
  );

  // Virtualizer: render only the rows in (or near) the viewport. Overscan of
  // 10 keeps short scrolls flicker-free. estimateSize is the fixed row height.
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    getItemKey: (index) => {
      const r = flatRows[index];
      switch (r.kind) {
        case "workspace":
        case "dir":
        case "file":
          return r.path;
        default:
          return r.key;
      }
    },
  });

  return (
    <div
      className="flex flex-col h-full text-sm select-none"
      style={{ background: "var(--bg-soft)" }}
    >
      <div
        className="flex items-center gap-1 px-2"
        style={{
          height: 32,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <input
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder={t("filetree.pathPlaceholder")}
          spellCheck={false}
          disabled={busy}
          className="flex-1 min-w-0 px-2 py-1 text-xs rounded outline-none"
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            color: "var(--text)",
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={openFolder}
          title={t("filetree.selectFolder")}
        >
          <FiFolderPlus size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          title={t("filetree.collapse")}
        >
          <FiChevronsLeft size={16} />
        </Button>
      </div>
      {error && (
        <div
          className="px-2 py-1 text-xs"
          style={{ color: "#ef4444", background: "var(--bg)" }}
        >
          {error}
        </div>
      )}
      {workspaces.length === 0 ? (
        <div
          className="px-3 py-4 text-xs"
          style={{ color: "var(--text-soft)" }}
        >
          {t("filetree.emptyHint")}
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex-1"
          style={{ overflowY: "auto", overflowX: "hidden", paddingTop: 4 }}
        >
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const row = flatRows[vi.index];
              return (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: ROW_HEIGHT,
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  <RowDispatch
                    row={row}
                    onWorkspaceClick={handleWorkspaceClick}
                    onDirClick={handleDirClick}
                    onWorkspaceContextMenu={handleWorkspaceContextMenu}
                    onFolderContextMenu={handleFolderContextMenu}
                    onFileContextMenu={handleFileContextMenu}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Row renderers
// ----------------------------------------------------------------------------

interface RowDispatchProps {
  row: FlatRow;
  onWorkspaceClick: (path: string, open: boolean) => void;
  onDirClick: (path: string, workspace: string | null, open: boolean) => void;
  onWorkspaceContextMenu: (e: React.MouseEvent, w: string) => void;
  onFolderContextMenu: (e: React.MouseEvent, dir: string) => void;
  onFileContextMenu: (e: React.MouseEvent, file: string) => void;
}

const RowDispatch = memo(function RowDispatch({
  row,
  onWorkspaceClick,
  onDirClick,
  onWorkspaceContextMenu,
  onFolderContextMenu,
  onFileContextMenu,
}: RowDispatchProps) {
  switch (row.kind) {
    case "workspace":
      return (
        <WorkspaceRow
          path={row.path}
          open={row.open}
          onClick={onWorkspaceClick}
          onContextMenu={onWorkspaceContextMenu}
        />
      );
    case "dir":
      return (
        <DirRow
          path={row.path}
          name={row.name}
          depth={row.depth}
          workspace={row.workspace}
          open={row.open}
          onClick={onDirClick}
          onContextMenu={onFolderContextMenu}
        />
      );
    case "file":
      return (
        <FileRow
          path={row.path}
          name={row.name}
          depth={row.depth}
          onContextMenu={onFileContextMenu}
        />
      );
    case "loading":
      return <PlaceholderRow depth={row.depth}>{tStatic("common.loading")}</PlaceholderRow>;
    case "empty":
      return <PlaceholderRow depth={row.depth}>{tStatic("filetree.empty")}</PlaceholderRow>;
    case "error":
      return (
        <PlaceholderRow depth={row.depth} color="#ef4444">
          {row.msg}
        </PlaceholderRow>
      );
  }
});

interface WorkspaceRowProps {
  path: string;
  open: boolean;
  onClick: (path: string, open: boolean) => void;
  onContextMenu: (e: React.MouseEvent, w: string) => void;
}

const WorkspaceRow = memo(function WorkspaceRow({
  path,
  open,
  onClick,
  onContextMenu,
}: WorkspaceRowProps) {
  const handleClick = useCallback(() => onClick(path, open), [onClick, path, open]);
  const handleCtx = useCallback(
    (e: React.MouseEvent) => onContextMenu(e, path),
    [onContextMenu, path],
  );
  return (
    <div
      onClick={handleClick}
      onContextMenu={handleCtx}
      title={path}
      className="flex items-center gap-1 cursor-pointer"
      style={{
        height: ROW_HEIGHT,
        padding: "0 8px",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.3,
        color: "var(--text-soft)",
        background: "var(--bg-mute)",
      }}
    >
      <span style={{ width: 10, fontSize: 9 }}>{open ? "▼" : "▶"}</span>
      <span className="truncate flex-1">{shortName(path)}</span>
    </div>
  );
});

interface DirRowProps {
  path: string;
  name: string;
  depth: number;
  workspace: string | null;
  open: boolean;
  onClick: (path: string, workspace: string | null, open: boolean) => void;
  onContextMenu: (e: React.MouseEvent, dir: string) => void;
}

const DirRow = memo(function DirRow({
  path,
  name,
  depth,
  workspace,
  open,
  onClick,
  onContextMenu,
}: DirRowProps) {
  const handleClick = useCallback(
    () => onClick(path, workspace, open),
    [onClick, path, workspace, open],
  );
  const handleCtx = useCallback(
    (e: React.MouseEvent) => onContextMenu(e, path),
    [onContextMenu, path],
  );
  return (
    <Row
      depth={depth}
      active={false}
      onClick={handleClick}
      onContextMenu={handleCtx}
      title={path}
    >
      <Caret open={open} />
      <FiFolder size={14} color={FOLDER_COLOR} style={{ flexShrink: 0 }} />
      <span className="truncate" style={{ minWidth: 0, flex: 1 }}>
        {name}
      </span>
    </Row>
  );
});

interface FileRowProps {
  path: string;
  name: string;
  depth: number;
  onContextMenu: (e: React.MouseEvent, file: string) => void;
}

const FileRow = memo(function FileRow({
  path,
  name,
  depth,
  onContextMenu,
}: FileRowProps) {
  // Per-file subscriptions: each one returns a primitive (boolean / string)
  // so it's referentially stable, and only flips for the rows actually
  // affected. With virtualization there are at most ~30 of these alive.
  const active = useEditorStore(
    (s) => s.tabs.find((t) => t.id === s.activeId)?.filePath === path,
  );
  const marked = useEditorStore((s) => s.compareMarkPath === path);
  const gitStatus = useFileGitStatus(path);
  const nameColor = gitStatusColor(gitStatus);
  const badge = gitStatus && gitStatus !== "I" ? gitStatus : null;
  const handleClick = useCallback(() => void openFileByPath(path), [path]);
  const handleCtx = useCallback(
    (e: React.MouseEvent) => onContextMenu(e, path),
    [onContextMenu, path],
  );
  return (
    <Row
      depth={depth}
      active={active}
      marked={marked}
      onClick={handleClick}
      onContextMenu={handleCtx}
      title={marked ? `${path}\n(selected for compare)` : path}
    >
      <span style={{ width: 12, display: "inline-block", flexShrink: 0 }} />
      <LangIcon filePath={path} />
      <span
        className="truncate"
        style={{
          minWidth: 0,
          flex: 1,
          color: nameColor ?? undefined,
          textDecoration: gitStatus === "D" ? "line-through" : undefined,
        }}
      >
        {name}
      </span>
      {badge && (
        <span
          aria-label={`git: ${badge}`}
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: nameColor ?? "var(--text-soft)",
            flexShrink: 0,
            width: 12,
            textAlign: "center",
            lineHeight: 1,
          }}
        >
          {badge}
        </span>
      )}
    </Row>
  );
});

function PlaceholderRow({
  depth,
  color,
  children,
}: {
  depth: number;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="text-xs"
      style={{
        height: ROW_HEIGHT,
        display: "flex",
        alignItems: "center",
        paddingLeft: depth * 14 + 12,
        color: color ?? "var(--text-soft)",
      }}
    >
      {children}
    </div>
  );
}

interface RowProps {
  depth: number;
  active: boolean;
  marked?: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  title?: string;
}

const Row = memo(function Row({
  depth,
  active,
  marked,
  onClick,
  onContextMenu,
  children,
  title,
}: RowProps) {
  const cls =
    "dr-row flex items-center gap-1 cursor-pointer truncate" +
    (active ? " is-active" : "") +
    (marked ? " is-marked" : "");
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={title}
      className={cls}
      style={{
        paddingLeft: depth * 14 + 8,
        paddingRight: 8,
        height: ROW_HEIGHT,
        fontSize: 13,
        color: "var(--text)",
        boxShadow: marked ? "inset 2px 0 0 var(--accent)" : undefined,
      }}
    >
      {children}
    </div>
  );
});

function Caret({ open }: { open: boolean }) {
  return (
    <span
      style={{
        width: 12,
        display: "inline-block",
        textAlign: "center",
        fontSize: 10,
        color: "var(--text-soft)",
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 0.1s",
      }}
    >
      ▶
    </span>
  );
}

function shortName(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p;
}

// ----------------------------------------------------------------------------
// Right-click action helpers (kept top-level so they don't allocate per-row).
// ----------------------------------------------------------------------------

async function promptCreate(kind: "file" | "dir", parent: string) {
  const v = await promptInput({
    title: tStatic(kind === "file" ? "filetree.newFile" : "filetree.newDir"),
    label: tStatic("filetree.locatedAt", { parent }),
    placeholder: tStatic(
      kind === "file" ? "filetree.fileNamePlaceholder" : "filetree.dirNamePlaceholder",
    ),
  });
  if (!v) return;
  try {
    if (kind === "file") {
      const fullPath = await createFile(parent, v);
      await openFileByPath(fullPath);
    } else {
      await createDir(parent, v);
    }
  } catch (err) {
    logError(`create ${kind} failed`, err);
    alert(
      tStatic("filetree.createFailed", {
        err: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

async function promptDelete(path: string, isDir: boolean) {
  const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
  const ok = await confirmDelete(name, isDir);
  if (!ok) return;
  try {
    await deletePath(path);
  } catch (err) {
    logError("delete failed", err);
    alert(
      tStatic("filetree.deleteFailed", {
        err: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

async function promptRename(path: string, isDir: boolean) {
  const oldName = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
  const newName = await promptInput({
    title: tStatic(isDir ? "filetree.renameDir" : "filetree.renameFile"),
    label: tStatic("filetree.renameLabel", { name: oldName }),
    initial: oldName,
    placeholder: oldName,
  });
  if (!newName || newName === oldName) return;
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (idx <= 0) return;
  const sep = path[idx];
  const parent = path.slice(0, idx);
  const newPath = parent + sep + newName;
  try {
    await renamePath(path, newPath);
  } catch (err) {
    logError("rename failed", err);
    alert(
      tStatic("filetree.renameFailed", {
        err: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
