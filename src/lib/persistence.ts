import { invoke } from "@tauri-apps/api/core";
import { useEditorStore, type Tab, type Theme } from "../store/editor";
import { logInfo, logWarn } from "./logger";

const KEY_V2 = "deditor:state:v2";
const KEY_V1 = "deditor:state:v1"; // legacy, migrated to v2

interface PersistedTab {
  filePath: string | null;
  content: string;
  savedContent: string;
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

type Persisted = PersistedV2;

function migrate(raw: string): PersistedV2 | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.v === 2) return parsed as PersistedV2;
    if (parsed?.v === 1) {
      const v1 = parsed as PersistedV1;
      return {
        v: 2,
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
    raw = localStorage.getItem(KEY_V2) ?? localStorage.getItem(KEY_V1);
  } catch {
    return null;
  }
  if (!raw) return null;

  const data = migrate(raw);
  if (!data) return null;

  const restored: Tab[] = [];
  for (const t of data.tabs) {
    if (!t.filePath) {
      // Untitled tab: just restore its content as-is.
      restored.push({
        id: newId(),
        filePath: null,
        content: t.content ?? "",
        savedContent: t.savedContent ?? "",
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
        restored.push({
          id: newId(),
          filePath: null,
          content: t.content,
          savedContent: "",
        });
      }
      continue;
    }
    if (t.content === t.savedContent) {
      // Clean tab: pick up the latest disk content.
      restored.push({
        id: newId(),
        filePath: t.filePath,
        content: disk,
        savedContent: disk,
      });
    } else {
      // Dirty tab: keep the user's edits, but baseline savedContent against
      // current disk so the dirty marker reflects reality.
      restored.push({
        id: newId(),
        filePath: t.filePath,
        content: t.content,
        savedContent: disk,
      });
    }
  }

  const store = useEditorStore.getState();

  store.setWorkspaces(data.workspaces ?? []);
  if (store.theme !== data.theme) store.setTheme(data.theme);
  if (typeof data.editorFontSize === "number") {
    store.setEditorFontSize(data.editorFontSize);
  }

  useEditorStore.setState({
    showPreview: data.showPreview,
    showSidebar: data.showSidebar,
    previewMaximized: data.previewMaximized ?? false,
  });

  if (restored.length > 0) {
    const idx = Math.max(0, Math.min(data.activeIndex, restored.length - 1));
    store.replaceTabs(restored, restored[idx].id);
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
  const activeIndex = Math.max(
    0,
    s.tabs.findIndex((t) => t.id === s.activeId),
  );
  const base: Persisted = {
    v: 2,
    workspaces: s.workspaces,
    tabs: s.tabs.map((t) => ({
      filePath: t.filePath,
      content: t.content,
      savedContent: t.savedContent,
    })),
    activeIndex,
    theme: s.theme,
    showPreview: s.showPreview,
    showSidebar: s.showSidebar,
    sidebarPx: extras.sidebarPx,
    previewPct: extras.previewPct,
    editorFontSize: s.editorFontSize,
    previewMaximized: s.previewMaximized,
  };
  try {
    localStorage.setItem(KEY_V2, JSON.stringify(base));
    // remove old v1 key once we're successfully on v2
    localStorage.removeItem(KEY_V1);
  } catch (err) {
    // Likely QuotaExceeded if files are huge; fall back to metadata-only.
    try {
      const compact: Persisted = {
        ...base,
        tabs: base.tabs
          .filter((t) => t.filePath)
          .map((t) => ({ filePath: t.filePath, content: "", savedContent: "" })),
      };
      localStorage.setItem(KEY_V2, JSON.stringify(compact));
    } catch {
      logWarn("persistence save failed (quota exceeded?)", err);
    }
  }
}
