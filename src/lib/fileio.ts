import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useEditorStore } from "../store/editor";
import { confirmUnsaved } from "../components/ConfirmDialog";
import { logError, logInfo, logWarn } from "./logger";
import { notifyRefresh } from "./treeRefresh";
import { tStatic } from "./i18n";

const MD_FILTER = [
  { name: "Markdown", extensions: ["md", "markdown", "mdx"] },
  {
    name: "Code",
    extensions: [
      "js", "jsx", "ts", "tsx", "mjs", "cjs",
      "py", "pyi", "rs", "go",
      "java", "kt", "kts", "scala",
      "c", "h", "cpp", "cxx", "cc", "hpp",
      "cs", "swift", "rb", "php", "lua",
      "html", "htm", "css", "scss", "less", "vue", "svelte",
      "json", "jsonc", "yaml", "yml", "toml", "xml",
      "sql", "sh", "bash", "zsh",
      "txt", "log", "csv", "diff", "patch",
    ],
  },
  { name: "All", extensions: ["*"] },
];

export async function openFile() {
  const selected = await open({ multiple: true, filters: MD_FILTER });
  if (selected == null) return;
  const paths = Array.isArray(selected) ? selected : [selected];
  for (const p of paths) {
    try {
      const content = await invoke<string>("read_text_file", { path: p });
      useEditorStore.getState().openTab(p, content);
      logInfo(`opened file: ${p} (${content.length} chars)`);
    } catch (err) {
      logError(`open failed for ${p}`, err);
    }
  }
}

export async function openFileByPath(path: string) {
  const { tabs } = useEditorStore.getState();
  if (tabs.some((t) => t.filePath === path)) {
    useEditorStore.getState().openTab(path, "");
    return;
  }
  try {
    const content = await invoke<string>("read_text_file", { path });
    useEditorStore.getState().openTab(path, content);
    logInfo(`opened file: ${path} (${content.length} chars)`);
  } catch (err) {
    logError(`open failed for ${path}`, err);
  }
}

export async function openMany(paths: string[]) {
  for (const p of paths) {
    await openFileByPath(p);
  }
}

export async function saveFile() {
  const { tabs, activeId, markSaved } = useEditorStore.getState();
  const active = tabs.find((t) => t.id === activeId);
  if (!active) return;
  if (!active.filePath) return saveFileAs();
  try {
    await invoke("write_text_file", { path: active.filePath, content: active.content });
    markSaved();
    logInfo(`saved: ${active.filePath} (${active.content.length} chars)`);
  } catch (err) {
    logError(`save failed for ${active.filePath}`, err);
    throw err;
  }
}

export async function saveFileAs() {
  const { tabs, activeId, rebindActive } = useEditorStore.getState();
  const active = tabs.find((t) => t.id === activeId);
  if (!active) return;
  const target = await save({
    filters: MD_FILTER,
    defaultPath: active.filePath ?? "untitled.md",
  });
  if (!target) return;
  try {
    await invoke("write_text_file", { path: target, content: active.content });
    rebindActive(target, active.content);
    logInfo(`saved as: ${target} (${active.content.length} chars)`);
  } catch (err) {
    logError(`saveAs failed for ${target}`, err);
    throw err;
  }
}

export function newFile() {
  useEditorStore.getState().newUntitled();
}

export async function closeActiveTab() {
  const { tabs, activeId, closeTab } = useEditorStore.getState();
  const active = tabs.find((t) => t.id === activeId);
  if (!active) return;
  if (active.content !== active.savedContent) {
    const choice = await confirmUnsaved(
      tStatic("fileio.unsavedClose", { name: displayName(active.filePath) }),
    );
    if (choice === "cancel") return;
    if (choice === "save") {
      try {
        await saveFile();
      } catch {
        return;
      }
    }
  }
  closeTab(active.id);
}

export async function closeTabById(id: string) {
  const { tabs, closeTab } = useEditorStore.getState();
  const t = tabs.find((x) => x.id === id);
  if (!t) return;
  if (t.content !== t.savedContent) {
    useEditorStore.getState().setActive(id);
    const choice = await confirmUnsaved(
      tStatic("fileio.unsavedClose", { name: displayName(t.filePath) }),
    );
    if (choice === "cancel") return;
    if (choice === "save") {
      try {
        await saveFile();
      } catch {
        return;
      }
    }
  }
  closeTab(id);
}

export async function openFolder() {
  const selected = await open({ directory: true, multiple: true });
  if (selected == null) return;
  const paths = Array.isArray(selected) ? selected : [selected];
  for (const p of paths) {
    useEditorStore.getState().addWorkspace(p);
    logInfo(`workspace added: ${p}`);
  }
}

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export async function listDir(path: string): Promise<DirEntry[]> {
  return invoke<DirEntry[]>("list_dir", { path });
}

export async function resolvePath(path: string): Promise<string> {
  return invoke<string>("resolve_path", { path });
}

export async function setWorkspaceByPath(path: string): Promise<void> {
  try {
    const resolved = await resolvePath(path);
    await listDir(resolved);
    useEditorStore.getState().addWorkspace(resolved);
    logInfo(`workspace added: ${resolved}`);
  } catch (err) {
    logWarn(`setWorkspaceByPath failed for ${path}`, err);
    throw err;
  }
}

export async function saveImage(
  baseDir: string,
  name: string,
  data: string,
): Promise<string> {
  return invoke<string>("save_image", { dir: baseDir, name, data });
}

export async function createFile(parentDir: string, name: string): Promise<string> {
  const target = joinPath(parentDir, name);
  try {
    await invoke("create_file", { path: target });
    logInfo(`created file: ${target}`);
    notifyRefresh(parentDir);
    return target;
  } catch (err) {
    logError(`createFile failed: ${target}`, err);
    throw err;
  }
}

export async function createDir(parentDir: string, name: string): Promise<string> {
  const target = joinPath(parentDir, name);
  try {
    await invoke("create_dir", { path: target });
    logInfo(`created dir: ${target}`);
    notifyRefresh(parentDir);
    return target;
  } catch (err) {
    logError(`createDir failed: ${target}`, err);
    throw err;
  }
}

export async function revealInFinder(path: string): Promise<void> {
  try {
    await revealItemInDir(path);
  } catch (err) {
    logError(`reveal in finder failed: ${path}`, err);
    alert(
      tStatic("fileio.cantOpenLocation", {
        err: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

export async function renamePath(from: string, to: string): Promise<void> {
  await invoke("rename_path", { from, to });
  logInfo(`renamed: ${from} -> ${to}`);
  // Refresh both ends in case from/to were under different parents (defensive;
  // current callers keep the parent stable but it's cheap to cover both).
  const fromIdx = Math.max(from.lastIndexOf("/"), from.lastIndexOf("\\"));
  const toIdx = Math.max(to.lastIndexOf("/"), to.lastIndexOf("\\"));
  if (fromIdx > 0) notifyRefresh(from.slice(0, fromIdx));
  if (toIdx > 0 && from.slice(0, fromIdx) !== to.slice(0, toIdx)) {
    notifyRefresh(to.slice(0, toIdx));
  }
  // Re-point any open tabs that referenced the old path. For a directory we
  // also handle children whose absolute path was prefixed by `from + sep`.
  const { tabs } = useEditorStore.getState();
  let anyChanged = false;
  const remapped = tabs.map((t) => {
    if (!t.filePath) return t;
    if (t.filePath === from) {
      anyChanged = true;
      return { ...t, filePath: to };
    }
    if (t.filePath.startsWith(from + "/") || t.filePath.startsWith(from + "\\")) {
      anyChanged = true;
      const rest = t.filePath.slice(from.length);
      return { ...t, filePath: to + rest };
    }
    return t;
  });
  if (anyChanged) {
    useEditorStore.setState({ tabs: remapped });
  }
}

export async function deletePath(path: string): Promise<void> {
  try {
    await invoke("delete_path", { path });
    logInfo(`deleted: ${path}`);
    // notify the parent so the tree refreshes
    const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    if (idx > 0) notifyRefresh(path.slice(0, idx));
    // Close any tabs pointing at the deleted path or under it (if it was a dir)
    const { tabs, closeTab } = useEditorStore.getState();
    for (const t of tabs) {
      if (!t.filePath) continue;
      if (t.filePath === path || t.filePath.startsWith(path + "/") || t.filePath.startsWith(path + "\\")) {
        closeTab(t.id);
      }
    }
  } catch (err) {
    logError(`delete failed: ${path}`, err);
    throw err;
  }
}

function joinPath(parent: string, child: string): string {
  const sep = parent.includes("\\") && !parent.includes("/") ? "\\" : "/";
  if (parent.endsWith(sep)) return parent + child;
  return parent + sep + child;
}

function displayName(filePath: string | null): string {
  if (!filePath) return tStatic("common.untitled");
  return filePath.split(/[\\/]/).pop() ?? filePath;
}
