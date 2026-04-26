import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useEditorStore } from "../store/editor";
import { confirmUnsaved } from "../components/ConfirmDialog";
import { logError, logInfo, logWarn } from "./logger";
import { notifyRefresh } from "./treeRefresh";
import { tStatic } from "./i18n";
import { isImageFile, isPdfFile, isAudioFile, isVideoFile, isHexFile } from "./lang";

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
  {
    name: "Image",
    extensions: ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico", "tiff", "tif"],
  },
  { name: "PDF", extensions: ["pdf"] },
  {
    name: "Audio",
    extensions: ["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus"],
  },
  {
    name: "Video",
    extensions: ["mp4", "webm", "mov", "m4v", "ogv"],
  },
  { name: "All", extensions: ["*"] },
];

export async function openFile() {
  const selected = await open({ multiple: true, filters: MD_FILTER });
  if (selected == null) return;
  const paths = Array.isArray(selected) ? selected : [selected];
  await openMany(paths);
}

export async function openFileByPath(path: string) {
  if (isImageFile(path)) return openBinaryAsDataUrl(path, "image");
  if (isPdfFile(path)) return openBinaryAsDataUrl(path, "pdf");
  if (isAudioFile(path)) return openBinaryAsDataUrl(path, "audio");
  if (isVideoFile(path)) return openBinaryAsDataUrl(path, "video");
  if (isHexFile(path)) return openBinaryAsDataUrl(path, "hex");
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

/** Read both files as text and open a side-by-side diff tab. Refuses binary
 *  files (image/pdf/audio/video/hex) since a meaningful line diff requires
 *  decodable text. */
export async function openCompare(leftPath: string, rightPath: string): Promise<void> {
  if (
    isImageFile(leftPath) || isPdfFile(leftPath) || isAudioFile(leftPath) ||
    isVideoFile(leftPath) || isHexFile(leftPath) ||
    isImageFile(rightPath) || isPdfFile(rightPath) || isAudioFile(rightPath) ||
    isVideoFile(rightPath) || isHexFile(rightPath)
  ) {
    logWarn(`compare refused: binary file involved (${leftPath} vs ${rightPath})`);
    alert(tStatic("filetree.compareBinaryRefused"));
    return;
  }
  try {
    const [leftContent, rightContent] = await Promise.all([
      invoke<string>("read_text_file", { path: leftPath }),
      invoke<string>("read_text_file", { path: rightPath }),
    ]);
    useEditorStore.getState().openDiffTab({ leftPath, rightPath, leftContent, rightContent });
    useEditorStore.getState().setCompareMarkPath(null);
    logInfo(`compare opened: ${leftPath} vs ${rightPath}`);
  } catch (err) {
    logError(`compare failed: ${leftPath} vs ${rightPath}`, err);
  }
}

/** Read a binary file (image / PDF / audio / video) and open it as a tab whose
 *  content is a `data:` URL. The renderer in Editor.tsx branches on file type
 *  to pick the right element (<img>, <iframe>, <audio>, <video>). */
export async function openBinaryAsDataUrl(
  path: string,
  kind: "image" | "pdf" | "audio" | "video" | "hex",
): Promise<void> {
  const { openTab, tabs } = useEditorStore.getState();
  if (tabs.some((t) => t.filePath === path)) {
    openTab(path, "");
    return;
  }
  try {
    const dataUrl = await readAsDataUrl(path);
    openTab(path, dataUrl);
    logInfo(`opened ${kind}: ${path}`);
  } catch (err) {
    logError(`open ${kind} failed for ${path}`, err);
  }
}

/** Reload a binary file's data URL from disk (used by persistence to hydrate
 *  binary tabs on startup — we don't write the data URL to localStorage). */
export async function readAsDataUrl(path: string): Promise<string> {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME_MAP[ext] ?? "application/octet-stream";
  const base64 = await invoke<string>("read_binary_as_base64", { path });
  return `data:${mime};base64,${base64}`;
}

const MIME_MAP: Record<string, string> = {
  // image
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  tiff: "image/tiff",
  tif: "image/tiff",
  // pdf
  pdf: "application/pdf",
  // audio
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  m4a: "audio/mp4",
  aac: "audio/aac",
  opus: "audio/ogg",
  // video
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  ogv: "video/ogg",
};

/** Save every dirty tab that has a filePath. Untitled / diff / binary tabs
 *  are skipped. Used by auto-save (blur / debounce) and the future "save all"
 *  command. Errors are swallowed per file so one bad disk doesn't block the
 *  whole batch. */
export async function saveAllDirty(): Promise<void> {
  const { tabs, markSaved, activeId } = useEditorStore.getState();
  for (const t of tabs) {
    if (!t.filePath) continue;
    if (t.diff) continue;
    if (t.content === t.savedContent) continue;
    try {
      await invoke("write_text_file", { path: t.filePath, content: t.content });
      // markSaved only operates on active tab; do it manually for non-active
      if (t.id === activeId) {
        markSaved();
      } else {
        useEditorStore.setState({
          tabs: useEditorStore
            .getState()
            .tabs.map((x) =>
              x.id === t.id ? { ...x, savedContent: x.content } : x,
            ),
        });
      }
      logInfo(`auto-saved: ${t.filePath} (${t.content.length} chars)`);
    } catch (err) {
      logError(`auto-save failed for ${t.filePath}`, err);
    }
  }
}

export async function saveFile() {
  const { tabs, activeId, markSaved } = useEditorStore.getState();
  const active = tabs.find((t) => t.id === activeId);
  if (!active) return;
  // Diff tabs are read-only — there's nothing to save.
  if (active.diff) return;
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
  if (active.diff) return;
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
  // Keep the compare mark in sync if it pointed at the renamed file.
  const { compareMarkPath, setCompareMarkPath } = useEditorStore.getState();
  if (compareMarkPath === from) setCompareMarkPath(to);
  else if (
    compareMarkPath &&
    (compareMarkPath.startsWith(from + "/") || compareMarkPath.startsWith(from + "\\"))
  ) {
    setCompareMarkPath(to + compareMarkPath.slice(from.length));
  }
}

export async function deletePath(path: string): Promise<void> {
  try {
    await invoke("delete_path", { path });
    logInfo(`deleted: ${path}`);
    // notify the parent so the tree refreshes
    const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    if (idx > 0) notifyRefresh(path.slice(0, idx));
    // Clear the compare mark if it's gone now.
    const mark = useEditorStore.getState().compareMarkPath;
    if (mark && (mark === path || mark.startsWith(path + "/") || mark.startsWith(path + "\\"))) {
      useEditorStore.getState().setCompareMarkPath(null);
    }
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
