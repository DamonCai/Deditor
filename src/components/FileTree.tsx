import { useCallback, useEffect, useState } from "react";
import { useEditorStore } from "../store/editor";
import {
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

const FOLDER_COLOR = "#dcb67a"; // soft amber, matches VSCode default folder icon

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

export default function FileTree() {
  const t = useT();
  const { workspaces, removeWorkspace, toggleSidebar } = useEditorStore();
  const filePath = useEditorStore(
    (s) => s.tabs.find((t) => t.id === s.activeId)?.filePath ?? null,
  );
  const compareMarkPath = useEditorStore((s) => s.compareMarkPath);
  const setCompareMarkPath = useEditorStore((s) => s.setCompareMarkPath);
  const [pathInput, setPathInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);

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

  const openMenu = (e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

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
      <div
        className="flex-1 py-1"
        style={{ overflowY: "auto", overflowX: "hidden" }}
      >
        {workspaces.length === 0 ? (
          <div
            className="px-3 py-4 text-xs"
            style={{ color: "var(--text-soft)" }}
          >
            {t("filetree.emptyHint")}
          </div>
        ) : (
          workspaces.map((w) => (
            <WorkspaceSection
              key={w}
              path={w}
              activePath={filePath}
              onContextMenu={(e) =>
                openMenu(e, [
                  {
                    label: t("filetree.newFileInWs"),
                    onClick: () => promptCreate("file", w),
                  },
                  {
                    label: t("filetree.newDirInWs"),
                    onClick: () => promptCreate("dir", w),
                  },
                  { divider: true },
                  {
                    label: t("filetree.revealInFinder"),
                    onClick: () => revealInFinder(w),
                  },
                  { divider: true },
                  {
                    label: t("filetree.removeFromWs", { name: shortName(w) }),
                    onClick: () => removeWorkspace(w),
                  },
                ])
              }
              onFolderContextMenu={(e, dir) =>
                openMenu(e, [
                  {
                    label: t("filetree.newFile"),
                    onClick: () => promptCreate("file", dir),
                  },
                  {
                    label: t("filetree.newDir"),
                    onClick: () => promptCreate("dir", dir),
                  },
                  { divider: true },
                  {
                    label: t("filetree.revealInFinder"),
                    onClick: () => revealInFinder(dir),
                  },
                  { divider: true },
                  {
                    label: t("filetree.renameDir"),
                    onClick: () => promptRename(dir, true),
                  },
                  {
                    label: t("filetree.deleteDir"),
                    onClick: () => promptDelete(dir, true),
                  },
                ])
              }
              onFileContextMenu={(e, file) => {
                const marked = compareMarkPath;
                const items: MenuItem[] = [
                  {
                    label: t("filetree.revealInFinder"),
                    onClick: () => revealInFinder(file),
                  },
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
                items.push(
                  { divider: true },
                  {
                    label: t("filetree.renameFile"),
                    onClick: () => promptRename(file, false),
                  },
                  {
                    label: t("filetree.deleteFile"),
                    onClick: () => promptDelete(file, false),
                  },
                );
                openMenu(e, items);
              }}
            />
          ))
        )}
      </div>
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
  // Build new path under the same parent. We pick the separator from the
  // existing path so Windows / POSIX both work.
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (idx <= 0) return; // root — refuse to rename
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

function shortName(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p;
}

function WorkspaceSection({
  path,
  activePath,
  onContextMenu,
  onFolderContextMenu,
  onFileContextMenu,
}: {
  path: string;
  activePath: string | null;
  onContextMenu: (e: React.MouseEvent) => void;
  onFolderContextMenu: (e: React.MouseEvent, dir: string) => void;
  onFileContextMenu: (e: React.MouseEvent, file: string) => void;
}) {
  // Workspace roots default to expanded; only honor an explicit `false` from
  // the persisted map. That way upgrading users who never collapsed anything
  // still see their workspaces expanded on first launch.
  const open = useEditorStore((s) => s.expandedDirs[path] !== false);
  const setDirExpanded = useEditorStore((s) => s.setDirExpanded);
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        onClick={() => setDirExpanded(path, !open)}
        onContextMenu={onContextMenu}
        title={path}
        className="flex items-center gap-1 cursor-pointer"
        style={{
          padding: "4px 8px",
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
      {open && (
        <Folder
          path={path}
          depth={0}
          activePath={activePath}
          onFolderContextMenu={onFolderContextMenu}
          onFileContextMenu={onFileContextMenu}
        />
      )}
    </div>
  );
}

function Folder({
  path,
  depth,
  activePath,
  onFolderContextMenu,
  onFileContextMenu,
}: {
  path: string;
  depth: number;
  activePath: string | null;
  onFolderContextMenu: (e: React.MouseEvent, dir: string) => void;
  onFileContextMenu: (e: React.MouseEvent, file: string) => void;
}) {
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const list = await listDir(path);
      setEntries(list);
    } catch (e) {
      setError(String(e));
    }
  }, [path]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return onRefresh((p) => {
      if (p === path) load();
    });
  }, [path, load]);

  return (
    <div>
      {entries === null && !error && <Spinner />}
      {error && <ErrorLine msg={error} />}
      {entries?.map((e) => (
        <Entry
          key={e.path}
          entry={e}
          depth={depth}
          activePath={activePath}
          onFolderContextMenu={onFolderContextMenu}
          onFileContextMenu={onFileContextMenu}
        />
      ))}
      {entries && entries.length === 0 && (
        <div
          className="px-3 py-2 text-xs"
          style={{
            color: "var(--text-soft)",
            paddingLeft: depth * 14 + 24,
          }}
        >
          {tStatic("filetree.empty")}
        </div>
      )}
    </div>
  );
}

function Entry({
  entry,
  depth,
  activePath,
  onFolderContextMenu,
  onFileContextMenu,
}: {
  entry: DirEntry;
  depth: number;
  activePath: string | null;
  onFolderContextMenu: (e: React.MouseEvent, dir: string) => void;
  onFileContextMenu: (e: React.MouseEvent, file: string) => void;
}) {
  if (entry.is_dir) {
    return (
      <DirNode
        entry={entry}
        depth={depth}
        activePath={activePath}
        onFolderContextMenu={onFolderContextMenu}
        onFileContextMenu={onFileContextMenu}
      />
    );
  }
  return (
    <FileNode
      entry={entry}
      depth={depth}
      activePath={activePath}
      onContextMenu={(e) => onFileContextMenu(e, entry.path)}
    />
  );
}

function DirNode({
  entry,
  depth,
  activePath,
  onFolderContextMenu,
  onFileContextMenu,
}: {
  entry: DirEntry;
  depth: number;
  activePath: string | null;
  onFolderContextMenu: (e: React.MouseEvent, dir: string) => void;
  onFileContextMenu: (e: React.MouseEvent, file: string) => void;
}) {
  // Nested folders default to collapsed; only honor an explicit `true` from
  // the persisted map. The user explicitly opening a folder is what we
  // remember — we don't want to suddenly expand every folder in a workspace
  // just because it once existed.
  const open = useEditorStore((s) => s.expandedDirs[entry.path] === true);
  const setDirExpanded = useEditorStore((s) => s.setDirExpanded);
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const list = await listDir(entry.path);
      setEntries(list);
    } catch (e) {
      setError(String(e));
    }
  }, [entry.path]);

  useEffect(() => {
    if (open && entries === null) load();
  }, [open, entries, load]);

  useEffect(() => {
    return onRefresh((p) => {
      if (p === entry.path) {
        if (open) load();
        else setEntries(null); // invalidate so next open re-fetches
      }
    });
  }, [entry.path, open, load]);

  return (
    <div>
      <Row
        depth={depth}
        active={false}
        onClick={() => setDirExpanded(entry.path, !open)}
        onContextMenu={(e) => onFolderContextMenu(e, entry.path)}
        title={entry.path}
      >
        <Caret open={open} />
        <FiFolder size={14} color={FOLDER_COLOR} style={{ flexShrink: 0 }} />
        <span className="truncate" style={{ minWidth: 0, flex: 1 }}>{entry.name}</span>
      </Row>
      {open && (
        <div>
          {entries === null && !error && (
            <Row depth={depth + 1} active={false} onClick={() => {}}>
              <span style={{ color: "var(--text-soft)" }}>...</span>
            </Row>
          )}
          {error && (
            <div
              className="px-3 py-1 text-xs"
              style={{ color: "#ef4444", paddingLeft: (depth + 1) * 14 + 12 }}
            >
              {error}
            </div>
          )}
          {entries?.map((e) => (
            <Entry
              key={e.path}
              entry={e}
              depth={depth + 1}
              activePath={activePath}
              onFolderContextMenu={onFolderContextMenu}
              onFileContextMenu={onFileContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FileNode({
  entry,
  depth,
  activePath,
  onContextMenu,
}: {
  entry: DirEntry;
  depth: number;
  activePath: string | null;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const active = entry.path === activePath;
  const marked = useEditorStore((s) => s.compareMarkPath === entry.path);
  return (
    <Row
      depth={depth}
      active={active}
      marked={marked}
      onClick={() => void openFileByPath(entry.path)}
      onContextMenu={onContextMenu}
      title={marked ? `${entry.path}\n(selected for compare)` : entry.path}
    >
      <span style={{ width: 12, display: "inline-block", flexShrink: 0 }} />
      <LangIcon filePath={entry.path} />
      <span className="truncate" style={{ minWidth: 0, flex: 1 }}>{entry.name}</span>
    </Row>
  );
}

function Row({
  depth,
  active,
  marked,
  onClick,
  onContextMenu,
  children,
  title,
}: {
  depth: number;
  active: boolean;
  marked?: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  title?: string;
}) {
  // The "marked for compare" highlight uses a dedicated background so it
  // remains visible even when another tab is the active file. Mark > active
  // visually so the user keeps track of what they staged for comparison.
  // Selected uses --selection-bg (JetBrains "row highlight" color); hover
  // uses the gentler --hover-bg overlay so they're visually distinct — you
  // can tell at a glance which row is selected vs. just under the cursor.
  const baseBg = marked
    ? "var(--compare-mark-bg)"
    : active
    ? "var(--selection-bg)"
    : "";
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={title}
      className="flex items-center gap-1 cursor-pointer truncate"
      style={{
        paddingLeft: depth * 14 + 8,
        paddingRight: 8,
        height: 22,
        fontSize: 13,
        background: baseBg || undefined,
        color: "var(--text)",
        boxShadow: marked ? "inset 2px 0 0 var(--accent)" : undefined,
      }}
      onMouseEnter={(e) => {
        if (!marked && !active) e.currentTarget.style.background = "var(--hover-bg)";
      }}
      onMouseLeave={(e) => {
        if (!marked && !active) e.currentTarget.style.background = "";
      }}
    >
      {children}
    </div>
  );
}

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

function Spinner() {
  return (
    <div className="px-3 py-2 text-xs" style={{ color: "var(--text-soft)" }}>
      {tStatic("common.loading")}
    </div>
  );
}

function ErrorLine({ msg }: { msg: string }) {
  return (
    <div className="px-3 py-2 text-xs" style={{ color: "#ef4444" }}>
      {msg}
    </div>
  );
}
