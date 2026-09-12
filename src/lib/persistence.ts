import { normalizeMarkdownPreferences, type MarkdownPreferences } from "./markdownPreferences";
import { invoke } from "@tauri-apps/api/core";
import {
  useEditorStore,
  type Lang,
  type Tab,
  type TabPosition,
  type Theme,
} from "../store/editor";
import { logInfo, logWarn } from "./logger";
import { isBinaryRenderable } from "./lang";
import { readAsDataUrl } from "./fileio";

// localStorage keys are LEGACY: persistence now lives in a real file managed
// by the Rust side (see read_app_state / write_app_state). We still read these
// once on first launch after upgrade so existing users don't lose their
// tabs/workspaces, then sweep them.
const KEY_V3 = "deditor:state:v3";
const KEY_V2 = "deditor:state:v2";
const KEY_V1 = "deditor:state:v1";

interface PersistedTab {
  recoveryId?: string;
  filePath: string | null;
  content: string;
  savedContent: string;
  // v3+: per-tab view state. Optional so older snapshots still parse.
  cursor?: number;
  scrollTopLine?: number;
}

interface PersistedV3 {
  v: 3;
  workspaces: string[];
  tabs: PersistedTab[];
  activeIndex: number;
  theme: Theme;
  showPreview: boolean;
  showSidebar: boolean;
  sidebarPx: number;
  previewPct: number;
  markdownSettings?: Partial<MarkdownPreferences>;
  editorFontSize?: number;
  /** Legacy global zoom snapshot: migrate its configured baseline only. */
  editorBaseFontSize?: number;
  /** "read" is accepted only for migrating the removed Markdown mode. */
  markdownMode?: "source" | "split" | "visual" | "read";
  previewMaximized?: boolean;
  /** Right-side TOC visibility in markdown reading mode. Default true. */
  tocVisible?: boolean; // Legacy expanded state; hover outlines start unpinned.
  tocPinned?: boolean;
  language?: Lang;
  /** Per-shortcut enable map. Optional so older snapshots keep loading. */
  shortcuts?: Record<string, boolean>;
  /** File-tree expansion state. Optional for backward compat. */
  expandedDirs?: Record<string, boolean>;
  /** Soft wrap toggle. Optional; default true on load. */
  softWrap?: boolean;
  showIndentGuides?: boolean;
  showWhitespace?: boolean;
  showMinimap?: boolean;
  autoCloseBrackets?: boolean;
  autoSave?: "off" | "onBlur" | "afterDelay";
  formatOnSave?: boolean;
  // Legacy git fields kept in the type so old snapshots still parse safely;
  // unused since the git feature was removed.
  gitPanelOpen?: boolean;
  gitPanelHeight?: number;
  gitPanelTab?: "commit" | "log";
  gitDiffViewMode?: "side" | "unified";
}

interface PersistedV2 {
  v: 2;
  workspaces: string[];
  tabs: PersistedTab[];
  activeIndex: number;
  theme: Theme;
  showPreview: boolean;
  showSidebar: boolean;
  sidebarPx: number;
  previewPct: number;
  editorFontSize?: number;
  previewMaximized?: boolean;
}

interface PersistedV1 {
  v: 1;
  workspace: string | null;
  tabs: PersistedTab[];
  activeIndex: number;
  theme: Theme;
  showPreview: boolean;
  showSidebar: boolean;
  sidebarPx: number;
  previewPct: number;
}

type Persisted = PersistedV3;

function migrate(raw: string): PersistedV3 | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.v === 3) return parsed as PersistedV3;
    if (parsed?.v === 2) {
      const v2 = parsed as PersistedV2;
      return { ...v2, v: 3 };
    }
    if (parsed?.v === 1) {
      const v1 = parsed as PersistedV1;
      return {
        v: 3,
        workspaces: v1.workspace ? [v1.workspace] : [],
        tabs: v1.tabs,
        activeIndex: v1.activeIndex,
        theme: v1.theme,
        showPreview: v1.showPreview,
        showSidebar: v1.showSidebar,
        sidebarPx: v1.sidebarPx,
        previewPct: v1.previewPct,
      };
    }
  } catch {
    /* fall through */
  }
  return null;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface UiExtras {
  sidebarPx: number;
  previewPct: number;
}

async function readRaw(): Promise<string | null> {
  // Primary: file managed by Rust (`<app_data_dir>/state.json`). Survives
  // reinstall — unlike WKWebView localStorage, which gets a fresh bucket
  // every time the ad-hoc code-signing identifier changes.
  try {
    const fileRaw = await invoke<string>("read_app_state");
    if (fileRaw && fileRaw.length > 0) return fileRaw;
  } catch (err) {
    logWarn("read_app_state failed; falling back to localStorage", err);
  }
  // Fallback / migration path: read whatever the previous (localStorage)
  // backend wrote. The very next save flushes it back into the file, after
  // which the localStorage keys get swept (see doSave).
  try {
    return (
      localStorage.getItem(KEY_V3) ??
      localStorage.getItem(KEY_V2) ??
      localStorage.getItem(KEY_V1)
    );
  } catch {
    return null;
  }
}

export async function loadPersisted(): Promise<UiExtras | null> {
  const raw = await readRaw();
  if (!raw) return null;

  const data = migrate(raw);
  if (!data) return null;

  const restored: Tab[] = [];
  const restoredPositions: Record<string, TabPosition> = {};
  // Helper: stash position for the just-pushed tab if the snapshot had one.
  // We key positions by the freshly-minted tab id.
  const stashPos = (id: string, src: PersistedTab) => {
    if (src.cursor != null || src.scrollTopLine != null) {
      restoredPositions[id] = {
        cursor: Math.max(0, src.cursor ?? 0),
        scrollTopLine: Math.max(1, src.scrollTopLine ?? 1),
      };
    }
  };

  // PARALLEL REHYDRATION:
  // The original code awaited each read_text_file / readAsDataUrl one at a
  // time. With 30 persisted tabs at ~3 ms per IPC that's a ~100 ms blocking
  // wall on every cold start. The reads are independent — kick them all off
  // at once, then build the restored array in original order from the
  // resolved values. Untitled tabs (no IPC) stay synchronous.
  const reads = data.tabs.map((t): Promise<string | null> | string | null => {
    if (!t.filePath) return null;            // untitled — no disk read
    if (isBinaryRenderable(t.filePath)) {
      return readAsDataUrl(t.filePath).catch(() => null);
    }
    return invoke<string>("read_text_file", { path: t.filePath }).catch(() => null);
  });
  const settled = await Promise.all(reads);

  for (let i = 0; i < data.tabs.length; i++) {
    const t = data.tabs[i];
    const disk = settled[i];
    if (!t.filePath) {
      // Preserve recovery identity across restarts, without trusting duplicate ids.
      const id = t.recoveryId && /^[a-zA-Z0-9-]{1,80}$/.test(t.recoveryId) && !restored.some(tab => tab.id === t.recoveryId) ? t.recoveryId : newId();
      restored.push({
        id,
        filePath: null,
        content: t.content ?? "",
        savedContent: t.savedContent ?? "",
      });
      stashPos(id, t);
      continue;
    }
    if (isBinaryRenderable(t.filePath)) {
      // Binary-rendered files (image / pdf / audio / video). If the file is
      // gone, drop the tab.
      if (disk == null) continue;
      const id = newId();
      restored.push({
        id,
        filePath: t.filePath,
        content: disk,
        savedContent: disk,
      });
      continue;
    }
    // Named text tab.
    if (disk == null) {
      // File is gone. If user had unsaved edits, demote to untitled to
      // preserve them; otherwise drop the tab.
      if (t.content !== t.savedContent) {
        const id = newId();
        restored.push({
          id,
          filePath: null,
          content: t.content,
          savedContent: "",
        });
        stashPos(id, t);
      }
      continue;
    }
    if (t.content === t.savedContent) {
      // Clean tab: pick up the latest disk content.
      const id = newId();
      restored.push({
        id,
        filePath: t.filePath,
        content: disk,
        savedContent: disk,
      });
      stashPos(id, t);
    } else {
      // Dirty tab: keep the user's edits, but baseline savedContent against
      // current disk so the dirty marker reflects reality.
      const id = newId();
      restored.push({
        id,
        filePath: t.filePath,
        content: t.content,
        savedContent: disk,
      });
      stashPos(id, t);
    }
  }

  const store = useEditorStore.getState();

  store.setWorkspaces(data.workspaces ?? []);
  if (store.theme !== data.theme) store.setTheme(data.theme);
  if (data.language === "zh" || data.language === "en") {
    store.setLanguage(data.language);
  }
  useEditorStore.setState({ markdownSettings: normalizeMarkdownPreferences(data.markdownSettings) });
  const configuredFontSize = data.editorBaseFontSize ?? data.editorFontSize;
  if (typeof configuredFontSize === "number" && Number.isFinite(configuredFontSize)) {
    store.setEditorFontSize(configuredFontSize);
  }

  useEditorStore.setState({
    markdownMode: data.markdownMode === "read" ? "visual"
      : data.markdownMode === "source" || data.markdownMode === "split" || data.markdownMode === "visual" ? data.markdownMode
      : !data.showPreview ? "source" : data.previewMaximized ? "visual" : "split",
    showPreview: data.showPreview,
    showSidebar: data.showSidebar,
    previewMaximized: data.previewMaximized ?? false,
    tocVisible: data.tocPinned ?? false,
  });

  if (data.shortcuts && typeof data.shortcuts === "object") {
    // Merge over defaults so new shortcuts shipped after the snapshot was
    // written are still enabled by default.
    const cur = useEditorStore.getState().shortcuts;
    useEditorStore.getState().setShortcuts({ ...cur, ...data.shortcuts });
  }

  if (data.expandedDirs && typeof data.expandedDirs === "object") {
    useEditorStore.setState({ expandedDirs: { ...data.expandedDirs } });
  }

  if (typeof data.softWrap === "boolean") {
    useEditorStore.setState({ softWrap: data.softWrap });
  }
  if (typeof data.showIndentGuides === "boolean") {
    useEditorStore.setState({ showIndentGuides: data.showIndentGuides });
  }
  if (typeof data.showWhitespace === "boolean") {
    useEditorStore.setState({ showWhitespace: data.showWhitespace });
  }
  if (typeof data.showMinimap === "boolean") {
    useEditorStore.setState({ showMinimap: data.showMinimap });
  }
  if (typeof data.autoCloseBrackets === "boolean") {
    useEditorStore.setState({ autoCloseBrackets: data.autoCloseBrackets });
  }
  if (data.autoSave === "off" || data.autoSave === "onBlur" || data.autoSave === "afterDelay") {
    useEditorStore.setState({ autoSave: data.autoSave });
  }
  if (typeof data.formatOnSave === "boolean") {
    useEditorStore.setState({ formatOnSave: data.formatOnSave });
  }

  if (restored.length > 0) {
    const idx = Math.max(0, Math.min(data.activeIndex, restored.length - 1));
    store.replaceTabs(restored, restored[idx].id);
    store.setTabPositions(restoredPositions);
  }

  logInfo(
    `persistence restored: ${restored.length} tab(s), ${data.workspaces?.length ?? 0} workspace(s)`,
  );

  return {
    sidebarPx: data.sidebarPx,
    previewPct: data.previewPct,
  };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let latestExtras: UiExtras | null = null;
let pendingWrite: Promise<void> = Promise.resolve();

export function schedulePersist(extras: UiExtras): void {
  latestExtras = extras;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void doSave(extras).catch((err) => logWarn("write_app_state failed", err));
  }, 500);
}

/** Persist a completed close without leaving its recovery state on a timer. */
export function flushPersist(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  // Persistence starts after session hydration, when the UI supplies its sizes.
  if (!latestExtras) return pendingWrite;
  return doSave(latestExtras);
}

function doSave(extras: UiExtras): Promise<void> {
  const s = useEditorStore.getState();
  // Diff tabs are ephemeral — drop them before persisting so they don't show
  // up empty on next launch.
  const persistableTabs = s.tabs.filter((t) => !t.diff);
  const activeIdx0 = persistableTabs.findIndex((t) => t.id === s.activeId);
  const activeIndex = activeIdx0 < 0 ? 0 : activeIdx0;
  const base: Persisted = {
    v: 3,
    workspaces: s.workspaces,
    tabs: persistableTabs.map((t) => {
      const pos = s.tabPositions[t.id];
      // Three cases for tab content persistence:
      //
      // 1. Binary tabs hold a base64 data URL in `content` — easily multi-MB.
      //    Persist filePath only and rehydrate from disk on next launch.
      // 2. Clean named tabs: content matches what's on disk, so we don't need
      //    to write it into state.json. On load, we always re-read from disk
      //    anyway (line ~210). This is the BIG win — without this, 50 open
      //    files × 100 KB each = serializing ~5 MB on every state change
      //    (every 500 ms after any UI tweak). Cuts state.json down to KBs.
      // 3. Dirty named tabs OR untitled tabs: must persist content so the
      //    user's unsaved edits survive a relaunch.
      const binary = isBinaryRenderable(t.filePath);
      const dirty = t.content !== t.savedContent;
      const skipContent = binary || (t.filePath != null && !dirty);
      return {
        recoveryId: t.id,
        filePath: t.filePath,
        content: skipContent ? "" : t.content,
        savedContent: skipContent ? "" : t.savedContent,
        cursor: pos?.cursor,
        scrollTopLine: pos?.scrollTopLine,
      };
    }),
    activeIndex,
    theme: s.theme,
    markdownMode: s.markdownMode,
    showPreview: s.showPreview,
    showSidebar: s.showSidebar,
    sidebarPx: extras.sidebarPx,
    previewPct: extras.previewPct,
    markdownSettings: s.markdownSettings,
    editorFontSize: s.editorFontSize,
    previewMaximized: s.previewMaximized,
    tocPinned: s.tocVisible,
    language: s.language,
    shortcuts: s.shortcuts,
    expandedDirs: s.expandedDirs,
    softWrap: s.softWrap,
    showIndentGuides: s.showIndentGuides,
    showWhitespace: s.showWhitespace,
    showMinimap: s.showMinimap,
    autoCloseBrackets: s.autoCloseBrackets,
    autoSave: s.autoSave,
    formatOnSave: s.formatOnSave,
  };
  const content = JSON.stringify(base);
  // An older in-flight snapshot must finish before a close snapshot is written.
  const write = pendingWrite.then(() => invoke<void>("write_app_state", { content }));
  pendingWrite = write.catch(() => {});
  return write
    .then(() => {
      // Sweep legacy localStorage once we know the file write succeeded —
      // otherwise an interrupted migration could lose the snapshot.
      try {
        localStorage.removeItem(KEY_V3);
        localStorage.removeItem(KEY_V2);
        localStorage.removeItem(KEY_V1);
      } catch {
        /* private mode etc.; harmless */
      }
    });
}
