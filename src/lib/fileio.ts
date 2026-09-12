import { saveMarkdownImage } from "./markdownImageStorage";
import { showError } from "./feedback";
import { flushDocument, flushDocuments } from "./documentFlush";
import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useEditorStore, type Tab } from "../store/editor";
import { confirmUnsaved } from "../components/ConfirmDialog";
import { logError, logInfo, logWarn } from "./logger";
import { notifyRefresh } from "./treeRefresh";
import { tStatic } from "./i18n";
import { isMarkdown, isImageFile, isPdfFile, isAudioFile, isVideoFile, isHexFile, isXmindFile, isBinaryRenderable } from "./lang";
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
  { name: "XMind", extensions: ["xmind"] },
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
  // Sequential — preserves tab insertion order to match the input list.
  // We previously parallelized via Promise.all, which was ~30x faster on
  // 30-file drops, but openFileByPath calls openTab() the moment its
  // own IPC resolves; under parallelism the openTab order followed
  // IPC-completion order, not input order, so dropped files showed up
  // out of sequence. Order is a user-visible behavior we don't want to
  // regress; for typical 1–10 file drops the sequential cost is still
  // sub-50 ms.
  for (const p of paths) {
    try {
      await openFileByPath(p);
    } catch {
      // openFileByPath already logs; keep going so one bad file doesn't
      // strand the rest.
    }
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
    void showError(tStatic("filetree.compareBinaryRefused"));
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

/** Serialize saves per tab so an older write cannot finish after a newer one. */
const saves = new Map<string, Promise<boolean>>();
function queueSave(id: string, operation: () => Promise<boolean>): Promise<boolean> {
  const previous = saves.get(id) ?? Promise.resolve(true);
  const pending = previous.catch(() => false).then(operation);
  saves.set(id, pending);
  void pending.finally(() => {
    if (saves.get(id) === pending) saves.delete(id);
  }).catch(() => {});
  return pending;
}

async function writeTabContent(path: string, content: string, binary: boolean): Promise<void> {
  if (binary) {
    const data = dataUrlToBase64(content);
    if (data == null) throw new Error("Invalid binary document");
    await invoke("write_binary_file", { path, data });
  } else {
    await invoke("write_text_file", { path, content });
  }
}

async function maybeFormat(content: string, path: string, binary: boolean): Promise<string> {
  if (binary || !useEditorStore.getState().formatOnSave) return content;
  try {
    return (await formatBuffer(content, path)) ?? content;
  } catch (err) {
    logError("format on save failed", err);
    return content;
  }
}

/** Mark exactly the bytes written, preserving edits made while IPC was pending. */
function finishSave(snapshot: Tab, path: string, written: string): boolean {
  useEditorStore.setState((state) => ({
    tabs: state.tabs.map((tab) => {
      if (tab.id !== snapshot.id || tab.filePath !== snapshot.filePath) return tab;
      return {
        ...tab,
        filePath: path,
        content: tab.content === snapshot.content ? written : tab.content,
        savedContent: written,
        externalChange: tab.externalChange === snapshot.externalChange ? undefined : tab.externalChange,
      };
    }),
  }));
  const current = useEditorStore.getState().tabs.find((t) => t.id === snapshot.id);
  return !!current && current.filePath === path && current.content === written;
}

async function saveTab(id: string, saveAs = false, automatic = false): Promise<boolean> {
  return queueSave(id, async () => {
    flushDocument(id);
    const snapshot = useEditorStore.getState().tabs.find((t) => t.id === id);
    if (!snapshot || snapshot.diff) return false;
    if (automatic && (!snapshot.filePath || snapshot.externalChange != null)) return false;
    const binary = isBinaryRenderable(snapshot.filePath);
    let target = snapshot.filePath;
    if (saveAs || !target) {
      // macOS appends the first filter's extension even when defaultPath already
      // ends in .xmind. Keep the archive format explicit in Save As.
      const filters = isXmindFile(snapshot.filePath)
        ? [{ name: "XMind", extensions: ["xmind"] }]
        : MD_FILTER;
      target = await save({ filters, defaultPath: target ?? "untitled.md" });
      if (!target) return false;
      if (useEditorStore.getState().tabs.some((t) => t.id !== id && t.filePath === target)) {
        throw new Error(tStatic("fileio.targetAlreadyOpen"));
      }
    }
    // A tab may have closed or been renamed while the native dialog was open.
    if (!useEditorStore.getState().tabs.some((t) => t.id === id && t.filePath === snapshot.filePath)) return false;
    try {
      const content = snapshot.filePath && target !== snapshot.filePath && isMarkdown(snapshot.filePath) && isMarkdown(target) && useEditorStore.getState().markdownSettings.preserveImageTargets
        ? (await import("./markdownImagePaths")).rebaseMarkdownImages(snapshot.content, snapshot.filePath, target) : snapshot.content;
      const formatted = await maybeFormat(content, target, binary);
      if (target !== snapshot.filePath || formatted !== snapshot.savedContent) {
        await writeTabContent(target, formatted, binary);
      }
      const clean = finishSave(snapshot, target, formatted);
      logInfo(`saved: ${target} (${formatted.length} chars)`);
      return clean;
    } catch (err) {
      logError(`save failed for ${target}`, err);
      throw err;
    }
  });
}

export async function saveAllDirty(): Promise<void> {
  flushDocuments();
  const ids = useEditorStore.getState().tabs
    .filter((t) => t.filePath && !t.diff && t.content !== t.savedContent && t.externalChange == null)
    .map((t) => t.id);
  for (const id of ids) {
    try { await saveTab(id, false, true); }
    catch (err) { logError(`auto-save failed for tab ${id}`, err); }
  }
}

export async function saveFile(): Promise<boolean> {
  const id = useEditorStore.getState().activeId;
  return id ? saveTab(id) : false;
}

export async function saveFileAs(): Promise<boolean> {
  const id = useEditorStore.getState().activeId;
  return id ? saveTab(id, true) : false;
}

export function newFile() {
  useEditorStore.getState().newUntitled();
}

const closingTabs = new Map<string, Promise<boolean>>();
export async function closeActiveTab(): Promise<boolean> {
  const id = useEditorStore.getState().activeId;
  return id ? closeTabById(id) : false;
}

export function closeTabById(id: string): Promise<boolean> {
  const existing = closingTabs.get(id);
  if (existing) return existing;
  const pending = (async () => {
    flushDocument(id);
    const tab = useEditorStore.getState().tabs.find((t) => t.id === id);
    if (!tab) return true;
    if (tab.content !== tab.savedContent) {
      useEditorStore.getState().setActive(id);
      const choice = await confirmUnsaved(
        tStatic("fileio.unsavedClose", { name: displayName(tab.filePath) }),
      );
      if (choice === "cancel") return false;
      if (choice === "save") {
        try { if (!await saveTab(id)) return false; }
        catch { return false; }
      }
    }
    if (useEditorStore.getState().tabs.some((t) => t.id === id)) {
      useEditorStore.getState().closeTab(id);
    }
    return true;
  })();
  closingTabs.set(id, pending);
  void pending.finally(() => closingTabs.delete(id)).catch(() => {});
  return pending;
}

export async function closeOtherTabs(keepId: string): Promise<void> {
  const ids = useEditorStore.getState().tabs.filter((t) => t.id !== keepId).map((t) => t.id);
  for (const id of ids) {
    if (!await closeTabById(id)) return;
  }
  useEditorStore.getState().setActive(keepId);
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
  folder = "assets",
): Promise<string> {
  return saveMarkdownImage(baseDir, name, data, folder);
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
    void showError(
      tStatic("fileio.cantOpenLocation", {
        err: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

export async function renamePath(from: string, to: string): Promise<void> {
  const { rebaseMarkdownImages } = await import("./markdownImagePaths");
  flushDocuments();
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
    const filePath = t.filePath === from ? to : t.filePath.startsWith(from + "/") || t.filePath.startsWith(from + "\\") ? to + t.filePath.slice(from.length) : t.filePath;
    if (filePath !== t.filePath) anyChanged = true;
    return filePath === t.filePath ? t : { ...t, filePath };
  });
  if (anyChanged) useEditorStore.setState({ tabs: remapped });
  if (useEditorStore.getState().markdownSettings.preserveImageTargets && tabs.some(t => t.filePath && isMarkdown(t.filePath))) {
    for (const tab of tabs) {
      if (!tab.filePath || !isMarkdown(tab.filePath)) continue;
      const path = remapped.find(t => t.id === tab.id)!.filePath!;
      if (!isMarkdown(path)) continue;
      const updated = rebaseMarkdownImages(tab.content, tab.filePath, path, { from, to });
      if (updated !== tab.content) useEditorStore.getState().setContent(updated, tab.id, "command");
    }
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
