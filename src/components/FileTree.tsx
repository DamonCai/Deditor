import { showError } from "../lib/feedback";
import { memo, useCallback, useEffect, useId, useState } from "react";
import { useShallow } from "zustand/shallow";
import { useEditorStore, useActiveTabFilePath } from "../store/editor";
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
import { FiChevronRight, FiFolder, FiFolderPlus, FiMoreHorizontal } from "react-icons/fi";
import { Button } from "./ui/Button";

const FOLDER_COLOR = "#dcb67a"; // soft amber, matches VSCode default folder icon

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

// Zero props — wrap default export in memo so App re-renders (scroll-sync,
// splitter drag) don't re-run FileTree's body. Internal store subscriptions
// still wake it when relevant fields (workspaces / active filePath /
// expandedDirs etc.) actually change.
function FileTreeImpl() {
  const t = useT();
  // Per-field selectors — destructuring the whole store re-renders FileTree
  // (and all its nested rows) on every store change, including every keystroke.
  // workspaces is shallow-compared so its array reference can change without
  // waking FileTree when contents match.
  const workspaces = useEditorStore(useShallow((s) => s.workspaces));
  const removeWorkspace = useEditorStore((s) => s.removeWorkspace);
  const filePath = useActiveTabFilePath();
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

  const openMenu = useCallback((e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu({ x: e.clientX || rect.left, y: e.clientY || rect.bottom, items });
  }, []);

  // Workspace / folder / file context-menu builders are useCallback'd so the
  // identity stays stable across renders — React.memo'd row components below
  // can short-circuit re-renders when the only thing that changed is some
  // unrelated store field. Deps include the things the menu items close over.
  const onWorkspaceContextMenu = useCallback(
    (e: React.MouseEvent, w: string) =>
      openMenu(e, [
        { label: t("filetree.newFileInWs"), onClick: () => promptCreate("file", w) },
        { label: t("filetree.newDirInWs"), onClick: () => promptCreate("dir", w) },
        { divider: true },
        { label: t("filetree.revealInFinder"), onClick: () => revealInFinder(w) },
        { divider: true },
        {
          label: t("filetree.removeFromWs", { name: shortName(w) }),
          onClick: () => removeWorkspace(w),
        },
      ]),
    [t, openMenu, removeWorkspace],
  );
  const onFolderContextMenu = useCallback(
    (e: React.MouseEvent, dir: string) =>
      openMenu(e, [
        { label: t("filetree.newFile"), onClick: () => promptCreate("file", dir) },
        { label: t("filetree.newDir"), onClick: () => promptCreate("dir", dir) },
        { divider: true },
        { label: t("filetree.revealInFinder"), onClick: () => revealInFinder(dir) },
        { divider: true },
        { label: t("filetree.renameDir"), onClick: () => promptRename(dir, true) },
        { label: t("filetree.deleteDir"), onClick: () => promptDelete(dir, true) },
      ]),
    [t, openMenu],
  );
  const onFileContextMenu = useCallback(
    (e: React.MouseEvent, file: string) => {
      // Read compareMarkPath imperatively so this handler doesn't need to
      // re-create when the mark changes — the menu is built on demand.
      const marked = useEditorStore.getState().compareMarkPath;
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
          ? { label: t("filetree.unmarkForCompare"), onClick: () => setCompareMarkPath(null) }
          : { label: t("filetree.selectForCompare"), onClick: () => setCompareMarkPath(file) },
      );
      items.push(
        { divider: true },
        { label: t("filetree.renameFile"), onClick: () => promptRename(file, false) },
        { label: t("filetree.deleteFile"), onClick: () => promptDelete(file, false) },
      );
      openMenu(e, items);
    },
    [t, openMenu, setCompareMarkPath],
  );

  return (
    <div
      className="filetree flex flex-col h-full text-sm select-none"
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
          className="deditor-input deditor-input--compact flex-1"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={openFolder}
          title={t("filetree.selectFolder")}
        >
          <FiFolderPlus size={16} />
        </Button>
      </div>
      {error && (
        <div
          className="deditor-notice" role="alert" data-tone="error"
        >
          {error}
        </div>
      )}
      <div
        className="filetree-workspaces flex-1"
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
              showParent={workspaces.some((other) => other !== w && shortName(other) === shortName(w))}
              onWorkspaceContextMenu={onWorkspaceContextMenu}
              onFolderContextMenu={onFolderContextMenu}
              onFileContextMenu={onFileContextMenu}
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
    void showError(
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
    void showError(
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
    void showError(
      tStatic("filetree.renameFailed", {
        err: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

function shortName(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p;
}

const WorkspaceSection = memo(function WorkspaceSection({
  path,
  activePath,
  showParent,
  onWorkspaceContextMenu,
  onFolderContextMenu,
  onFileContextMenu,
}: {
  path: string;
  activePath: string | null;
  showParent: boolean;
  onWorkspaceContextMenu: (e: React.MouseEvent, w: string) => void;
  onFolderContextMenu: (e: React.MouseEvent, dir: string) => void;
  onFileContextMenu: (e: React.MouseEvent, file: string) => void;
}) {
  // Workspace roots default to expanded; only honor an explicit `false` from
  // the persisted map. That way upgrading users who never collapsed anything
  // still see their workspaces expanded on first launch.
  const open = useEditorStore((s) => s.expandedDirs[path] !== false);
  const setDirExpanded = useEditorStore((s) => s.setDirExpanded);
  const contentId = useId();
  const t = useT();
  const parent = path.replace(/[\\/]+$/, "").replace(/[\\/][^\\/]+$/, "");
  return (
    <section className="workspace-section" aria-label={path}>
      <div className="workspace-header" onContextMenu={(e) => onWorkspaceContextMenu(e, path)}>
        <button
          type="button"
          onClick={() => setDirExpanded(path, !open)}
          aria-expanded={open}
          aria-controls={contentId}
          title={path}
          className="workspace-toggle"
        >
          <Caret open={open} />
          <FiFolder size={15} className="workspace-icon" aria-hidden="true" />
          <span className="workspace-label">
            <span className="workspace-name">{shortName(path)}</span>
            {showParent && <span className="workspace-parent">{parent}</span>}
          </span>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="workspace-menu"
          title={t("filetree.folderActions", { name: shortName(path) })}
          onClick={(e) => onWorkspaceContextMenu(e, path)}
        >
          <FiMoreHorizontal size={14} aria-hidden="true" />
        </Button>
      </div>
      <div id={contentId}>
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
    </section>
  );
});

const Folder = memo(function Folder({
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
});

const Entry = memo(function Entry({
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
      onFileContextMenu={onFileContextMenu}
    />
  );
});

const DirNode = memo(function DirNode({
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
        expanded={open}
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
              className="deditor-notice" role="alert" data-tone="error"
              style={{ marginLeft: (depth + 1) * 14 }}
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
});

const FileNode = memo(function FileNode({
  entry,
  depth,
  activePath,
  onFileContextMenu,
}: {
  entry: DirEntry;
  depth: number;
  activePath: string | null;
  onFileContextMenu: (e: React.MouseEvent, file: string) => void;
}) {
  const active = entry.path === activePath;
  const marked = useEditorStore((s) => s.compareMarkPath === entry.path);
  return (
    <Row
      depth={depth}
      active={active}
      marked={marked}
      onClick={() => void openFileByPath(entry.path)}
      onContextMenu={(e) => onFileContextMenu(e, entry.path)}
      title={marked ? `${entry.path}\n(selected for compare)` : entry.path}
    >
      <span style={{ width: 12, display: "inline-block", flexShrink: 0 }} />
      <LangIcon filePath={entry.path} />
      <span className="truncate" style={{ minWidth: 0, flex: 1 }}>{entry.name}</span>
    </Row>
  );
});

function Row({
  depth,
  active,
  marked,
  expanded,
  onClick,
  onContextMenu,
  children,
  title,
}: {
  depth: number;
  active: boolean;
  marked?: boolean;
  expanded?: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={title}
      className="filetree-row"
      data-active={active || undefined}
      data-marked={marked || undefined}
      aria-current={active ? "page" : undefined}
      aria-expanded={expanded}
      style={{ paddingLeft: depth * 16 + 10 }}
    >
      {children}
    </button>
  );
}

function Caret({ open }: { open: boolean }) {
  return <FiChevronRight size={12} className="filetree-caret" data-open={open} aria-hidden="true" />;
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
    <div className="deditor-notice" role="alert" data-tone="error">
      {msg}
    </div>
  );
}

const FileTree = memo(FileTreeImpl);
export default FileTree;
