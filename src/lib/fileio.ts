import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useEditorStore } from "../store/editor";
import { confirmUnsaved } from "../components/ConfirmDialog";
import { logError, logInfo, logWarn } from "./logger";
import { notifyRefresh } from "./treeRefresh";
import { tStatic } from "./i18n";
import { isImageFile, isPdfFile, isAudioFile, isVideoFile, isHexFile, isXmindFile } from "./lang";
import { formatBuffer } from "./format";

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

/** Push a successfully-opened file onto the OS recent-documents list (macOS
 *  Dock right-click / File → Open Recent). No-op on other platforms. Errors
 *  are swallowed — failing to update the recent list shouldn't break opens. */
function noteRecentDocument(path: string): void {
  invoke("add_recent_document", { path }).catch(() => {});
}

export async function openFileByPath(path: string) {
  if (isImageFile(path)) {
    await openBinaryAsDataUrl(path, "image");
    noteRecentDocument(path);
    return;
  }
  if (isPdfFile(path)) {
    await openBinaryAsDataUrl(path, "pdf");
    noteRecentDocument(path);
    return;
  }
  if (isAudioFile(path)) {
    await openBinaryAsDataUrl(path, "audio");
    noteRecentDocument(path);
    return;
  }
  if (isVideoFile(path)) {
    await openBinaryAsDataUrl(path, "video");
    noteRecentDocument(path);
    return;
  }
  if (isHexFile(path)) {
    await openBinaryAsDataUrl(path, "hex");
    noteRecentDocument(path);
    return;
  }
  if (isXmindFile(path)) {
    await openBinaryAsDataUrl(path, "xmind");
    noteRecentDocument(path);
    return;
  }
  const { tabs } = useEditorStore.getState();
  if (tabs.some((t) => t.filePath === path)) {
    useEditorStore.getState().openTab(path, "");
    noteRecentDocument(path);
    return;
  }
  try {
    const content = await invoke<string>("read_text_file", { path });
    useEditorStore.getState().openTab(path, content);
    logInfo(`opened file: ${path} (${content.length} chars)`);
    noteRecentDocument(path);
  } catch (err) {
    logError(`open failed for ${path}`, err);
  }
}

export async function openMany(paths: string[]) {
  for (const p of paths) {
    await openFileByPath(p);
  }
}

/** Pop the reopen stack (Cmd+Shift+T) and bring the most recently closed
 *  tab back. Named tabs go through the regular open path so they pick up
 *  any external changes; untitled tabs restore their snapshot content.
 *  Cursor / scroll position are restored when present in the record. */
export async function reopenLastClosedTab(): Promise<void> {
  const { popClosedTab, openTab, setTabPosition } = useEditorStore.getState();
  const record = popClosedTab();
  if (!record) {
    logInfo("reopenLastClosedTab: stack is empty");
    return;
  }

  if (record.filePath == null) {
    // Untitled snapshot — recreate the tab with whatever content was there.
    const id = openTab(null, record.content);
    if (record.cursor != null || record.scrollTopLine != null) {
      setTabPosition(id, {
        cursor: record.cursor ?? 0,
        scrollTopLine: record.scrollTopLine ?? 1,
      });
    }
    logInfo("reopened closed tab (untitled)");
    return;
  }

  // Named tab — re-open via the standard dispatch so binary-rendered types
  // route correctly, then restore the saved cursor / scroll if we had it.
  await openFileByPath(record.filePath);
  const tab = useEditorStore.getState().tabs.find((t) => t.filePath === record.filePath);
  if (tab && (record.cursor != null || record.scrollTopLine != null)) {
    setTabPosition(tab.id, {
      cursor: record.cursor ?? 0,
      scrollTopLine: record.scrollTopLine ?? 1,
    });
  }
  logInfo(`reopened closed tab: ${record.filePath}`);
}

/** Read both files as text and open a side-by-side diff tab. Refuses binary
 *  files (image/pdf/audio/video/hex) since a meaningful line diff requires
 *  decodable text. */
export async function openCompare(leftPath: string, rightPath: string): Promise<void> {
  if (
    isImageFile(leftPath) || isPdfFile(leftPath) || isAudioFile(leftPath) ||
    isVideoFile(leftPath) || isHexFile(leftPath) || isXmindFile(leftPath) ||
    isImageFile(rightPath) || isPdfFile(rightPath) || isAudioFile(rightPath) ||
    isVideoFile(rightPath) || isHexFile(rightPath) || isXmindFile(rightPath)
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
  kind: "image" | "pdf" | "audio" | "video" | "hex" | "xmind",
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
  // xmind
  xmind: "application/vnd.xmind.workbook",
};

/** Extract the base64 payload from a `data:...;base64,...` URL. */
function dataUrlToBase64(dataUrl: string): string | null {
  if (!dataUrl.startsWith("data:")) return null;
  const idx = dataUrl.indexOf(";base64,");
  if (idx < 0) return null;
  return dataUrl.slice(idx + ";base64,".length);
}

/** Write a tab's content to disk. data: URLs go through write_binary_file
 *  (we strip the prefix and decode on the Rust side); plain text uses
 *  write_text_file. Lets callers stay agnostic to whether a tab is binary. */
async function writeTabContent(path: string, content: string): Promise<void> {
  const b64 = dataUrlToBase64(content);
  if (b64 != null) {
    await invoke("write_binary_file", { path, data: b64 });
  } else {
    await invoke("write_text_file", { path, content });
  }
}

/** Run Prettier on `content` if format-on-save is enabled and the path's
 *  extension has a configured parser. Returns the (possibly-formatted) text.
 *  Errors fall through silently — saving an unformattable file is still
 *  better than refusing to save. */
async function maybeFormat(content: string, path: string): Promise<string> {
  if (!useEditorStore.getState().formatOnSave) return content;
  // data: URLs are binary tabs; never run a text formatter on them.
  if (content.startsWith("data:")) return content;
  try {
    const formatted = await formatBuffer(content, path);
    return formatted ?? content;
  } catch {
    return content;
  }
}

/** Save every dirty tab that has a filePath. Untitled / diff tabs are skipped.
 *  Binary tabs whose content is a data URL go through write_binary_file. */
export async function saveAllDirty(): Promise<void> {
  const { tabs, markSaved, activeId, setContent } = useEditorStore.getState();
  for (const t of tabs) {
    if (!t.filePath) continue;
    if (t.diff) continue;
    if (t.content === t.savedContent) continue;
    try {
      const formatted = await maybeFormat(t.content, t.filePath);
      if (formatted !== t.content) setContent(formatted, t.id);
      await writeTabContent(t.filePath, formatted);
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
      logInfo(`auto-saved: ${t.filePath} (${formatted.length} chars)`);
    } catch (err) {
      logError(`auto-save failed for ${t.filePath}`, err);
    }
  }
}

export async function saveFile() {
  const { tabs, activeId, markSaved, setContent } = useEditorStore.getState();
  const active = tabs.find((t) => t.id === activeId);
  if (!active) return;
  // Diff tabs are read-only — there's nothing to save.
  if (active.diff) return;
  if (!active.filePath) return saveFileAs();
  // No-op fast path: Cmd+S on an unmodified file shouldn't bump mtime. Vite
  // (and any other HMR / file watcher) treats every mtime change as a real
  // edit and will fully reload, which causes a visible flash. Skip when
  // there's nothing to format and nothing to write.
  if (
    active.content === active.savedContent &&
    !useEditorStore.getState().formatOnSave
  ) {
    return;
  }
  try {
    const formatted = await maybeFormat(active.content, active.filePath);
    if (formatted === active.savedContent) {
      // Format-on-save was on but produced the same bytes already on disk.
      // Skip the write to avoid an HMR-triggering touch.
      if (formatted !== active.content) setContent(formatted, active.id);
      markSaved();
      return;
    }
    if (formatted !== active.content) setContent(formatted, active.id);
    await writeTabContent(active.filePath, formatted);
    markSaved();
    logInfo(`saved: ${active.filePath} (${formatted.length} chars)`);
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
    const formatted = await maybeFormat(active.content, target);
    await writeTabContent(target, formatted);
    rebindActive(target, formatted);
    logInfo(`saved as: ${target} (${formatted.length} chars)`);
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
