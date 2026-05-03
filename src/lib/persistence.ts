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
  /** Integrated terminal state — whether the panel is open at startup, its
   *  height in pixels, and any user shell override. */
  terminalOpen?: boolean;
  terminalPx?: number;
  terminalShell?: string;
  /** Active left-side tool window. Optional for backward compat. */
  /** Draft commit messages keyed by workspace. Persisted so a user editing
   *  a commit message at quit time finds it again next launch. */
  commitDrafts?: Record<string, string>;
  /** Active sidebar panel — Project (file tree) or Commit. */
  leftPanel?: "files" | "commit";
  /** Per-workspace commit options (signoff / allowEmpty / authorOverride). */
  commitOptions?: Record<
    string,
    { signoff?: boolean; allowEmpty?: boolean; authorOverride?: string }
  >;
  /** Recent commit messages, most-recent-first, for Cmd+↑ recall. */
  commitMessageHistory?: string[];
  commitViewMode?: "tree" | "flat";
  diffViewMode?: "side" | "unified";
  diffIgnoreWhitespace?: "none" | "leading" | "all";
  diffHighlightWords?: boolean;
  diffCollapseUnchanged?: boolean;
  gutterMarkers?: boolean;
  inlineBlame?: boolean;
  bgFetchEnabled?: boolean;
  bgFetchIntervalMin?: number;
  // Legacy git fields kept in the type so old snapshots still parse safely;
  // unused since the inline git panel feature was removed (Phase 4 0.7.0
  // ships read-only signals instead).
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
  terminalPx?: number;
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

  // Restore terminal panel state — open / height / shell override. We don't
  // restore an actual PTY session (its child process is long gone); the new
  // session spawns when the panel mounts.
  if (typeof data.terminalOpen === "boolean") {
    useEditorStore.setState({ terminalOpen: data.terminalOpen });
  }
  if (typeof data.terminalShell === "string") {
    useEditorStore.setState({ terminalShell: data.terminalShell });
  }
  if (data.commitDrafts && typeof data.commitDrafts === "object") {
    useEditorStore.setState({ commitDrafts: { ...data.commitDrafts } });
  }
  if (data.leftPanel === "files" || data.leftPanel === "commit") {
    useEditorStore.setState({ leftPanel: data.leftPanel });
  }
  if (data.commitOptions && typeof data.commitOptions === "object") {
    useEditorStore.setState({ commitOptions: { ...data.commitOptions } });
  }
  if (Array.isArray(data.commitMessageHistory)) {
    useEditorStore.setState({
      commitMessageHistory: data.commitMessageHistory.filter(
        (s) => typeof s === "string",
      ),
    });
  }
  if (data.commitViewMode === "tree" || data.commitViewMode === "flat") {
    useEditorStore.setState({ commitViewMode: data.commitViewMode });
  }
  if (data.diffViewMode === "side" || data.diffViewMode === "unified") {
    useEditorStore.setState({ diffViewMode: data.diffViewMode });
  }
  if (
    data.diffIgnoreWhitespace === "none" ||
    data.diffIgnoreWhitespace === "leading" ||
    data.diffIgnoreWhitespace === "all"
  ) {
    useEditorStore.setState({ diffIgnoreWhitespace: data.diffIgnoreWhitespace });
  }
  if (typeof data.diffHighlightWords === "boolean") {
    useEditorStore.setState({ diffHighlightWords: data.diffHighlightWords });
  }
  if (typeof data.diffCollapseUnchanged === "boolean") {
    useEditorStore.setState({
      diffCollapseUnchanged: data.diffCollapseUnchanged,
    });
  }
  if (typeof data.gutterMarkers === "boolean") {
    useEditorStore.setState({ gutterMarkers: data.gutterMarkers });
  }
  if (typeof data.inlineBlame === "boolean") {
    useEditorStore.setState({ inlineBlame: data.inlineBlame });
  }
  if (typeof data.bgFetchEnabled === "boolean") {
    useEditorStore.setState({ bgFetchEnabled: data.bgFetchEnabled });
  }
  if (typeof data.bgFetchIntervalMin === "number") {
    useEditorStore.setState({
      bgFetchIntervalMin: Math.max(1, Math.min(60, data.bgFetchIntervalMin)),
    });
  }

  return {
    sidebarPx: data.sidebarPx,
    previewPct: data.previewPct,
    terminalPx: data.terminalPx,
  };
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function schedulePersist(extras: UiExtras): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => runSaveSoon(extras), 500);
}

/** Yield the actual stringify+IPC to a browser idle slice so the 500ms
 *  debounce expiring doesn't directly block the keystroke that armed it.
 *  Falls back to a 0ms timeout on Safari < 16 (no requestIdleCallback). */
function runSaveSoon(extras: UiExtras): void {
  type IdleCb = (cb: IdleRequestCallback, opts?: { timeout: number }) => number;
  const ric = (window as unknown as { requestIdleCallback?: IdleCb })
    .requestIdleCallback;
  if (ric) ric(() => doSave(extras), { timeout: 1500 });
  else setTimeout(() => doSave(extras), 0);
}

/** Per-tab JSON string cache. doSave checks each tab against this map and
 *  reuses the cached fragment when the inputs (content / savedContent /
 *  cursor / scrollTopLine / filePath) match — typing in one tab doesn't
 *  force a re-stringify of the other 49. */
interface TabJsonEntry {
  filePath: string | null;
  content: string;
  savedContent: string;
  cursor: number | undefined;
  scrollTopLine: number | undefined;
  json: string;
}
const tabJsonCache = new Map<string, TabJsonEntry>();

/** Returns true when any field that ends up in the persisted snapshot has
 *  changed between two store states. Lets the App-level subscription cheaply
 *  filter out high-frequency mutations that don't affect persistence
 *  (cursor moves, selection length, terminal session metadata, dialog state,
 *  etc.) so we don't re-arm the 500ms persist timer on every keystroke.
 *
 *  Intentionally a hand-maintained list — when you add a new field to
 *  `doSave`'s `base` object, add it here too. */
export function persistRelevantChanged(
  prev: ReturnType<typeof useEditorStore.getState>,
  next: ReturnType<typeof useEditorStore.getState>,
): boolean {
  return (
    prev.tabs !== next.tabs ||
    prev.activeId !== next.activeId ||
    prev.tabPositions !== next.tabPositions ||
    prev.workspaces !== next.workspaces ||
    prev.theme !== next.theme ||
    prev.showPreview !== next.showPreview ||
    prev.showSidebar !== next.showSidebar ||
    prev.editorFontSize !== next.editorFontSize ||
    prev.previewMaximized !== next.previewMaximized ||
    prev.language !== next.language ||
    prev.shortcuts !== next.shortcuts ||
    prev.expandedDirs !== next.expandedDirs ||
    prev.softWrap !== next.softWrap ||
    prev.showIndentGuides !== next.showIndentGuides ||
    prev.showWhitespace !== next.showWhitespace ||
    prev.showMinimap !== next.showMinimap ||
    prev.autoCloseBrackets !== next.autoCloseBrackets ||
    prev.autoSave !== next.autoSave ||
    prev.formatOnSave !== next.formatOnSave ||
    prev.terminalOpen !== next.terminalOpen ||
    prev.terminalShell !== next.terminalShell ||
    prev.commitDrafts !== next.commitDrafts ||
    prev.leftPanel !== next.leftPanel ||
    prev.commitOptions !== next.commitOptions ||
    prev.commitMessageHistory !== next.commitMessageHistory ||
    prev.commitViewMode !== next.commitViewMode ||
    prev.diffViewMode !== next.diffViewMode ||
    prev.diffIgnoreWhitespace !== next.diffIgnoreWhitespace ||
    prev.diffHighlightWords !== next.diffHighlightWords ||
    prev.diffCollapseUnchanged !== next.diffCollapseUnchanged ||
    prev.gutterMarkers !== next.gutterMarkers ||
    prev.inlineBlame !== next.inlineBlame ||
    prev.bgFetchEnabled !== next.bgFetchEnabled ||
    prev.bgFetchIntervalMin !== next.bgFetchIntervalMin
  );
}

function doSave(extras: UiExtras): void {
  const s = useEditorStore.getState();
  // Diff / Log tabs are ephemeral — they re-derive from git state when
  // reopened and shouldn't pin sessions.
  const persistableTabs = s.tabs.filter((t) => !t.diff && !t.log);
  const activeIdx0 = persistableTabs.findIndex((t) => t.id === s.activeId);
  const activeIndex = activeIdx0 < 0 ? 0 : activeIdx0;

  // Build the tabs portion of the JSON incrementally — reuse cached
  // per-tab fragments when their inputs are unchanged. With 50 tabs and
  // editing one of them, this turns N stringify calls into 1.
  const liveIds = new Set<string>();
  const tabFragments: string[] = [];
  for (const t of persistableTabs) {
    liveIds.add(t.id);
    const pos = s.tabPositions[t.id];
    // Binary tabs hold a base64 data URL — easily multi-MB. Persist filePath
    // only and rehydrate from disk on next launch; keeps state.json small
    // and skips serializing data we'll re-read anyway.
    const binary = isBinaryRenderable(t.filePath);
    const content = binary ? "" : t.content;
    const savedContent = binary ? "" : t.savedContent;
    const cursor = pos?.cursor;
    const scrollTopLine = pos?.scrollTopLine;
    const cached = tabJsonCache.get(t.id);
    if (
      cached &&
      cached.filePath === t.filePath &&
      cached.content === content &&
      cached.savedContent === savedContent &&
      cached.cursor === cursor &&
      cached.scrollTopLine === scrollTopLine
    ) {
      tabFragments.push(cached.json);
      continue;
    }
    const json = JSON.stringify({
      filePath: t.filePath,
      content,
      savedContent,
      cursor,
      scrollTopLine,
    });
    tabJsonCache.set(t.id, {
      filePath: t.filePath,
      content,
      savedContent,
      cursor,
      scrollTopLine,
      json,
    });
    tabFragments.push(json);
  }
  // Evict cache entries for closed tabs so memory doesn't grow unboundedly
  // for users who churn a lot of tabs in a session.
  if (tabJsonCache.size > liveIds.size) {
    for (const id of tabJsonCache.keys()) {
      if (!liveIds.has(id)) tabJsonCache.delete(id);
    }
  }

  // Stringify the rest (everything except `tabs`) in one shot, then splice
  // the prebuilt tabs array in. This keeps the bulk-of-bytes path cached.
  const restJson = JSON.stringify({
    v: 3,
    workspaces: s.workspaces,
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
    expandedDirs: s.expandedDirs,
    softWrap: s.softWrap,
    showIndentGuides: s.showIndentGuides,
    showWhitespace: s.showWhitespace,
    showMinimap: s.showMinimap,
    autoCloseBrackets: s.autoCloseBrackets,
    autoSave: s.autoSave,
    formatOnSave: s.formatOnSave,
    terminalOpen: s.terminalOpen,
    terminalPx: extras.terminalPx,
    terminalShell: s.terminalShell,
    commitDrafts: s.commitDrafts,
    leftPanel: s.leftPanel,
    commitOptions: s.commitOptions,
    commitMessageHistory: s.commitMessageHistory,
    commitViewMode: s.commitViewMode,
    diffViewMode: s.diffViewMode,
    diffIgnoreWhitespace: s.diffIgnoreWhitespace,
    diffHighlightWords: s.diffHighlightWords,
    diffCollapseUnchanged: s.diffCollapseUnchanged,
    gutterMarkers: s.gutterMarkers,
    inlineBlame: s.inlineBlame,
    bgFetchEnabled: s.bgFetchEnabled,
    bgFetchIntervalMin: s.bgFetchIntervalMin,
  });
  // restJson starts with `{`. Splice `"tabs": [...],` right after it.
  const tabsArrayJson = `"tabs":[${tabFragments.join(",")}]`;
  const fullJson =
    restJson.length === 2 // "{}" — no other fields, shouldn't happen
      ? `{${tabsArrayJson}}`
      : `{${tabsArrayJson},${restJson.slice(1, -1)}}`;

  invoke("write_app_state", { content: fullJson })
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
    })
    .catch((err) => logWarn("write_app_state failed", err));
}
