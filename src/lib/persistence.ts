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

const KEY_V3 = "deditor:state:v3";
const KEY_V2 = "deditor:state:v2"; // legacy, migrated to v3
const KEY_V1 = "deditor:state:v1"; // legacy, migrated to v3

interface PersistedTab {
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
  editorFontSize?: number;
  previewMaximized?: boolean;
  language?: Lang;
  /** Per-shortcut enable map. Optional so older snapshots keep loading. */
  shortcuts?: Record<string, boolean>;
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

export async function loadPersisted(): Promise<UiExtras | null> {
  let raw: string | null = null;
  try {
    raw =
      localStorage.getItem(KEY_V3) ??
      localStorage.getItem(KEY_V2) ??
      localStorage.getItem(KEY_V1);
  } catch {
    return null;
  }
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

  for (const t of data.tabs) {
    if (!t.filePath) {
      // Untitled tab: just restore its content as-is.
      const id = newId();
      restored.push({
        id,
        filePath: null,
        content: t.content ?? "",
        savedContent: t.savedContent ?? "",
      });
      stashPos(id, t);
      continue;
    }
    // Binary-rendered files (image / pdf / audio / video) live as data: URLs.
    // We never persist that base64 to localStorage (would blow the quota), so
    // we always reload from disk here. If the file is gone, drop the tab.
    if (isBinaryRenderable(t.filePath)) {
      let dataUrl: string | null = null;
      try {
        dataUrl = await readAsDataUrl(t.filePath);
      } catch {
        dataUrl = null;
      }
      if (dataUrl == null) continue;
      const id = newId();
      restored.push({
        id,
        filePath: t.filePath,
        content: dataUrl,
        savedContent: dataUrl,
      });
      continue;
    }
    // Named tab: try to read current disk contents.
    let disk: string | null = null;
    try {
      disk = await invoke<string>("read_text_file", { path: t.filePath });
    } catch {
      disk = null;
    }
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
  if (typeof data.editorFontSize === "number") {
    store.setEditorFontSize(data.editorFontSize);
  }

  useEditorStore.setState({
    showPreview: data.showPreview,
    showSidebar: data.showSidebar,
    previewMaximized: data.previewMaximized ?? false,
  });

  if (data.shortcuts && typeof data.shortcuts === "object") {
    // Merge over defaults so new shortcuts shipped after the snapshot was
    // written are still enabled by default.
    const cur = useEditorStore.getState().shortcuts;
    useEditorStore.getState().setShortcuts({ ...cur, ...data.shortcuts });
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

export function schedulePersist(extras: UiExtras): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => doSave(extras), 500);
}

function doSave(extras: UiExtras): void {
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
      // Binary tabs hold a base64 data URL in `content` — that can be many
      // megabytes and would blow localStorage's quota. Persist filePath only
      // and rehydrate from disk on next launch.
      const binary = isBinaryRenderable(t.filePath);
      return {
        filePath: t.filePath,
        content: binary ? "" : t.content,
        savedContent: binary ? "" : t.savedContent,
        cursor: pos?.cursor,
        scrollTopLine: pos?.scrollTopLine,
      };
    }),
    activeIndex,
    theme: s.theme,
    showPreview: s.showPreview,
    showSidebar: s.showSidebar,
    sidebarPx: extras.sidebarPx,
    previewPct: extras.previewPct,
    editorFontSize: s.editorFontSize,
    previewMaximized: s.previewMaximized,
    language: s.language,
    shortcuts: s.shortcuts,
  };
  try {
    localStorage.setItem(KEY_V3, JSON.stringify(base));
    // sweep older keys once we're successfully on v3
    localStorage.removeItem(KEY_V2);
    localStorage.removeItem(KEY_V1);
  } catch (err) {
    // Likely QuotaExceeded if files are huge; fall back to metadata-only.
    try {
      const compact: Persisted = {
        ...base,
        tabs: base.tabs
          .filter((t) => t.filePath)
          .map((t) => ({
            filePath: t.filePath,
            content: "",
            savedContent: "",
            cursor: t.cursor,
            scrollTopLine: t.scrollTopLine,
          })),
      };
      localStorage.setItem(KEY_V3, JSON.stringify(compact));
    } catch {
      logWarn("persistence save failed (quota exceeded?)", err);
    }
  }
}
