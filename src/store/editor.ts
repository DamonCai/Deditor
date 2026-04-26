import { create } from "zustand";
import { DEFAULT_SHORTCUTS, type ShortcutId } from "../lib/shortcuts";

export type Theme = "light" | "dark";
export type Lang = "zh" | "en";

export interface DiffSpec {
  leftPath: string;
  rightPath: string;
  leftContent: string;
  rightContent: string;
}

export interface Tab {
  id: string;
  filePath: string | null;
  content: string;
  savedContent: string;
  /** When set, this tab is a side-by-side file comparison. The `filePath`,
   *  `content`, and `savedContent` fields are ignored for diff tabs (kept on
   *  the type so the rest of the codebase doesn't have to special-case them). */
  diff?: DiffSpec;
  /** When the file was changed on disk while the tab was dirty in DEditor,
   *  we stash the on-disk content here and surface a banner so the user can
   *  pick "reload from disk" or "keep my edits". Cleared once the user chooses. */
  externalChange?: string;
}

export interface TabPosition {
  cursor: number;
  scrollTopLine: number;
}

interface EditorState {
  tabs: Tab[];
  activeId: string | null;
  workspaces: string[];
  // View state (caret + first visible line) per tab id. Kept outside `tabs`
  // so frequent updates don't churn the tabs array (which TabBar / TitleBar /
  // StatusBar all subscribe to).
  tabPositions: Record<string, TabPosition>;
  theme: Theme;
  language: Lang;
  showPreview: boolean;
  showSidebar: boolean;
  previewMaximized: boolean;
  editorFontSize: number;
  /** Path of the file the user marked via "Select for Compare" in the file
   *  tree. Right-clicking another file then offers "Compare with Selected". */
  compareMarkPath: string | null;
  /** Per-shortcut enable/disable map. Missing keys default to enabled (so new
   *  shortcuts shipped in updates "just work" for upgrading users). */
  shortcuts: Record<string, boolean>;
  /** Whether the Settings dialog is showing. Lives in the store so the
   *  StatusBar (or anything else) can pop it open without a separate bus. */
  settingsOpen: boolean;
  /** Whether the Goto Anything palette is showing. Lifted to store so the
   *  Command Palette can dispatch it as a runnable action. */
  gotoAnythingOpen: boolean;
  /** Whether the Command Palette is showing. */
  commandPaletteOpen: boolean;
  gotoSymbolOpen: boolean;
  findInFilesOpen: boolean;
  /** Persisted file-tree expansion state, keyed by absolute path.
   *  - `true`  = explicitly expanded
   *  - `false` = explicitly collapsed
   *  - missing = use the layer's default (workspace roots default to expanded,
   *              nested folders default to collapsed)
   *  Stored as a 3-state map so we can tell "user collapsed this" apart from
   *  "we've never seen this path before". */
  expandedDirs: Record<string, boolean>;
  /** Soft wrap (CodeMirror's `EditorView.lineWrapping`). Default on — matches
   *  the previous hard-coded behavior so nothing visually changes for
   *  existing users. */
  softWrap: boolean;
  /** Render indent guides (vertical lines per indent level). */
  showIndentGuides: boolean;
  /** Show whitespace markers (· for spaces, → for tabs). */
  showWhitespace: boolean;
  /** Render a minimap on the right edge of the editor. */
  showMinimap: boolean;
  /** Split the editor area into two side-by-side views of the same active
   *  tab (independent cursor + scroll). Toggled via the command palette /
   *  shortcut. Tab list itself is unchanged — both views read the same tab. */
  splitEditor: boolean;
  /** Distraction-free mode hides the title bar, tab bar, sidebar, status
   *  bar — only the editor (and Markdown preview if active) remain. Toggled
   *  via Cmd+K Z (matches VSCode "Zen Mode") or via the command palette. */
  zenMode: boolean;
  /** Auto-save: "off" | "onBlur" | "afterDelay". afterDelay debounces 1.5s
   *  after the user stops typing. onBlur saves when the window loses focus. */
  autoSave: "off" | "onBlur" | "afterDelay";

  setContent: (content: string) => void;
  // Open a new tab (or focus existing one for the same path).
  openTab: (filePath: string | null, content: string) => string;
  // Open a side-by-side diff tab. Dedupes on (leftPath, rightPath).
  openDiffTab: (spec: DiffSpec) => string;
  setCompareMarkPath: (path: string | null) => void;
  setShortcutEnabled: (id: ShortcutId, enabled: boolean) => void;
  setShortcuts: (next: Record<string, boolean>) => void;
  resetShortcuts: () => void;
  setSettingsOpen: (open: boolean) => void;
  setGotoAnythingOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setGotoSymbolOpen: (open: boolean) => void;
  setFindInFilesOpen: (open: boolean) => void;
  setDirExpanded: (path: string, expanded: boolean) => void;
  setSoftWrap: (on: boolean) => void;
  setShowIndentGuides: (on: boolean) => void;
  setShowWhitespace: (on: boolean) => void;
  setShowMinimap: (on: boolean) => void;
  toggleSplitEditor: () => void;
  setSplitEditor: (on: boolean) => void;
  toggleZenMode: () => void;
  setZenMode: (on: boolean) => void;
  setAutoSave: (mode: "off" | "onBlur" | "afterDelay") => void;
  // Replace active tab's file (used when "Save As" rebinds path).
  rebindActive: (filePath: string, content: string) => void;
  newUntitled: () => string;
  closeTab: (id: string) => void;
  closeOthers: (id: string) => void;
  setActive: (id: string) => void;
  replaceTabs: (tabs: Tab[], activeId: string) => void;
  reorderTabs: (fromIdx: number, toIdx: number) => void;
  markSaved: () => void;

  setTabPosition: (id: string, pos: TabPosition) => void;
  setTabPositions: (positions: Record<string, TabPosition>) => void;

  addWorkspace: (path: string) => void;
  removeWorkspace: (path: string) => void;
  setWorkspaces: (paths: string[]) => void;

  setTheme: (theme: Theme) => void;
  setLanguage: (lang: Lang) => void;
  togglePreview: () => void;
  togglePreviewMaximized: () => void;
  toggleSidebar: () => void;
  setShowSidebar: (v: boolean) => void;
  setEditorFontSize: (px: number) => void;
  isActiveDirty: () => boolean;
}

const DEFAULT_CONTENT_ZH = `# 欢迎使用 DEditor

这是一个基于 **Tauri + React + CodeMirror** 的 Markdown / 多语言代码编辑器。

## 快捷键

### 文件

- \`Cmd/Ctrl+N\` 新建标签
- \`Cmd/Ctrl+O\` 打开文件（可多选）
- \`Cmd/Ctrl+Shift+O\` 打开文件夹（添加为工作区）
- \`Cmd/Ctrl+S\` 保存，\`Cmd/Ctrl+Shift+S\` 另存为
- \`Cmd/Ctrl+W\` 关闭当前标签
- 拖文件 / 多文件到窗口直接打开；**拖目录则添加为工作区**

### 导航

- \`Cmd/Ctrl+P\` 跨工作区模糊搜索文件（Goto Anything）
- \`Cmd/Ctrl+Shift+P\` 命令面板（搜所有命令并执行）
- \`Cmd/Ctrl+R\` 当前文件大纲跳转（Goto Symbol）
- \`Cmd/Ctrl+Shift+F\` 全工作区文本搜索（Find in Files）
- \`Cmd/Ctrl+Alt+G\` 跳到指定行
- \`Cmd/Ctrl+,\` 打开设置
- \`Cmd/Ctrl+B\` 开关左侧文件树
- \`Cmd/Ctrl+K\` 切换专注模式（隐藏所有 chrome）
- \`Cmd/Ctrl+\\\` 切换分屏（同一文件双视图）
- 鼠标点 TabBar 切换标签；鼠标中键点标签 = 关闭

### 编辑

- \`Cmd/Ctrl+Z\` 撤销，\`Cmd/Ctrl+Shift+Z\` 重做（**切换标签会保留各自的撤销栈**）
- \`Cmd/Ctrl+X / C / V\` 剪切 / 复制 / 粘贴
- \`Cmd/Ctrl+A\` 全选
- \`Cmd/Ctrl+F\` 当前文件内查找，\`Cmd/Ctrl+G\` 跳到下一个匹配
- \`Cmd/Ctrl+D\` 选中下一个相同词
- \`Cmd/Ctrl+Shift+L\` 选中所有相同词
- \`Cmd/Ctrl+Alt+↑ / ↓\` 在上 / 下方加一个光标
- \`Cmd/Ctrl+Alt+[ / ]\` 折叠 / 展开当前块
- \`Cmd/Ctrl+Click\` 在点击位置追加光标
- \`Alt+Drag\` 列选 / 矩形选择
- \`Tab / Shift+Tab\` 缩进 / 反缩进

### 书签

- \`F2\` 在当前行打 / 取消书签（书签会随编辑漂移）
- \`F8\` / \`Shift+F8\` 跳到下 / 上一个书签
- \`Cmd/Ctrl+Shift+F2\` 清空当前文件全部书签

> 设置（\`Cmd/Ctrl+,\`）里可以调主题 / 字号 / 自动保存 / minimap / 缩进引导线 / 显示空白等，
> 也可以**关闭任何与系统/输入法冲突的快捷键**，菜单条目仍可点击使用。
> 文件被外部改动时会自动检测：clean tab 静默重载，dirty tab 弹横幅让你选"重载"还是"保留我的修改"。

### 文件树（右键）

- 在 Finder 中显示
- 选为对比文件 → 在另一个文件上右键"与 xxx 对比" 打开 side-by-side diff
- 重命名 / 删除 / 新建文件 / 新建文件夹
- 图片 / PDF / 音视频点击直接打开预览；Word / Excel / 压缩包等二进制文件以 hex dump 展示

## 代码示例

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`
`;

const DEFAULT_CONTENT_EN = `# Welcome to DEditor

A Markdown / multi-language code editor built on **Tauri + React + CodeMirror**.

## Shortcuts

### File

- \`Cmd/Ctrl+N\` New tab
- \`Cmd/Ctrl+O\` Open file (multi-select)
- \`Cmd/Ctrl+Shift+O\` Open folder (add as workspace)
- \`Cmd/Ctrl+S\` Save, \`Cmd/Ctrl+Shift+S\` Save As
- \`Cmd/Ctrl+W\` Close current tab
- Drag one or more files onto the window to open; **drop a folder to add it as a workspace**

### Navigation

- \`Cmd/Ctrl+P\` Fuzzy file search across workspaces (Goto Anything)
- \`Cmd/Ctrl+Shift+P\` Command Palette (search all commands and run)
- \`Cmd/Ctrl+R\` Goto Symbol — outline of the current file
- \`Cmd/Ctrl+Shift+F\` Find in Files (text search across all workspaces)
- \`Cmd/Ctrl+Alt+G\` Goto line number
- \`Cmd/Ctrl+,\` Open Settings
- \`Cmd/Ctrl+B\` Toggle the file tree sidebar
- \`Cmd/Ctrl+K\` Toggle Zen mode (hide all chrome)
- \`Cmd/Ctrl+\\\` Toggle split editor (two views of the same file)
- Click a tab in the bar to switch; middle-click to close

### Editing

- \`Cmd/Ctrl+Z\` Undo, \`Cmd/Ctrl+Shift+Z\` Redo (**each tab keeps its own undo history**)
- \`Cmd/Ctrl+X / C / V\` Cut / Copy / Paste
- \`Cmd/Ctrl+A\` Select all
- \`Cmd/Ctrl+F\` Find in current file, \`Cmd/Ctrl+G\` Jump to next match
- \`Cmd/Ctrl+D\` Select next occurrence of the current word
- \`Cmd/Ctrl+Shift+L\` Select all occurrences
- \`Cmd/Ctrl+Alt+↑ / ↓\` Add a cursor above / below
- \`Cmd/Ctrl+Alt+[ / ]\` Fold / Unfold the current block
- \`Cmd/Ctrl+Click\` Add a cursor at the click position
- \`Alt+Drag\` Column / rectangular selection
- \`Tab / Shift+Tab\` Indent / Outdent

### Bookmarks

- \`F2\` Toggle a bookmark on the current line (positions track edits)
- \`F8\` / \`Shift+F8\` Jump to the next / previous bookmark
- \`Cmd/Ctrl+Shift+F2\` Clear all bookmarks in the current file

> Open Settings (\`Cmd/Ctrl+,\`) to tweak theme / font size / auto-save / minimap /
> indent guides / whitespace markers, or to **disable any shortcut that conflicts
> with your OS, IME, or another app** — menu items stay clickable.
> External file changes are detected automatically: clean tabs reload silently,
> dirty tabs show a banner so you can pick "reload" or "keep my edits".

### File Tree (right-click)

- Reveal in Finder
- Select for Compare → right-click another file → "Compare with …" opens a side-by-side diff
- Rename / Delete / New File / New Folder
- Click any image / PDF / audio / video to preview inline; Word / Excel /
  archives and other binaries are shown as a hex dump

## Code sample

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`
`;

// First-launch language. Persisted choice (loaded by persistence.ts) overrides
// this when present, so users who switch to 中文 keep it.
function detectLang(): Lang {
  return "en";
}

export const DEFAULT_CONTENT = DEFAULT_CONTENT_EN;

export function defaultContentForLang(lang: Lang): string {
  return lang === "en" ? DEFAULT_CONTENT_EN : DEFAULT_CONTENT_ZH;
}

function newId(): string {
  return (
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function makeTab(filePath: string | null, content: string): Tab {
  return { id: newId(), filePath, content, savedContent: content };
}

const initial = makeTab(null, DEFAULT_CONTENT);

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [initial],
  activeId: initial.id,
  workspaces: [],
  tabPositions: {},
  theme:
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light",
  language: detectLang(),
  showPreview: true,
  showSidebar: true,
  previewMaximized: false,
  editorFontSize: 14,
  compareMarkPath: null,
  shortcuts: { ...DEFAULT_SHORTCUTS },
  settingsOpen: false,
  gotoAnythingOpen: false,
  commandPaletteOpen: false,
  gotoSymbolOpen: false,
  findInFilesOpen: false,
  expandedDirs: {},
  softWrap: true,
  showIndentGuides: true,
  showWhitespace: false,
  showMinimap: false,
  splitEditor: false,
  zenMode: false,
  autoSave: "off",

  setContent: (content) => {
    const { tabs, activeId } = get();
    set({
      tabs: tabs.map((t) => (t.id === activeId ? { ...t, content } : t)),
    });
  },

  openTab: (filePath, content) => {
    const { tabs, activeId } = get();
    if (filePath) {
      const existing = tabs.find((t) => t.filePath === filePath);
      if (existing) {
        set({ activeId: existing.id });
        return existing.id;
      }
    }
    const active = tabs.find((t) => t.id === activeId);
    const replaceActive =
      active &&
      active.filePath === null &&
      active.content === active.savedContent &&
      tabs.length === 1;

    if (replaceActive) {
      const t = makeTab(filePath, content);
      set({ tabs: [t], activeId: t.id });
      return t.id;
    }
    const t = makeTab(filePath, content);
    set({ tabs: [...tabs, t], activeId: t.id });
    return t.id;
  },

  openDiffTab: (spec) => {
    const { tabs } = get();
    // Dedupe: same pair (in the same direction) → focus existing tab.
    const existing = tabs.find(
      (t) => t.diff && t.diff.leftPath === spec.leftPath && t.diff.rightPath === spec.rightPath,
    );
    if (existing) {
      set({ activeId: existing.id });
      return existing.id;
    }
    const t: Tab = {
      id: newId(),
      filePath: null,
      content: "",
      savedContent: "",
      diff: spec,
    };
    set({ tabs: [...tabs, t], activeId: t.id });
    return t.id;
  },

  setCompareMarkPath: (path) => set({ compareMarkPath: path }),

  setShortcutEnabled: (id, enabled) => {
    const cur = get().shortcuts;
    if (cur[id] === enabled) return;
    set({ shortcuts: { ...cur, [id]: enabled } });
  },
  setShortcuts: (next) => set({ shortcuts: { ...next } }),
  resetShortcuts: () => set({ shortcuts: { ...DEFAULT_SHORTCUTS } }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setGotoAnythingOpen: (open) => set({ gotoAnythingOpen: open }),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setGotoSymbolOpen: (open) => set({ gotoSymbolOpen: open }),
  setFindInFilesOpen: (open) => set({ findInFilesOpen: open }),

  setDirExpanded: (path, expanded) => {
    const cur = get().expandedDirs;
    if (cur[path] === expanded) return;
    set({ expandedDirs: { ...cur, [path]: expanded } });
  },
  setSoftWrap: (on) => set({ softWrap: on }),
  setShowIndentGuides: (on) => set({ showIndentGuides: on }),
  setShowWhitespace: (on) => set({ showWhitespace: on }),
  setShowMinimap: (on) => set({ showMinimap: on }),
  toggleSplitEditor: () => set({ splitEditor: !get().splitEditor }),
  setSplitEditor: (on) => set({ splitEditor: on }),
  toggleZenMode: () => set({ zenMode: !get().zenMode }),
  setZenMode: (on) => set({ zenMode: on }),
  setAutoSave: (mode) => set({ autoSave: mode }),

  rebindActive: (filePath, content) => {
    const { tabs, activeId } = get();
    set({
      tabs: tabs.map((t) =>
        t.id === activeId
          ? { ...t, filePath, content, savedContent: content }
          : t,
      ),
    });
  },

  newUntitled: () => {
    const { tabs, language } = get();
    const t = makeTab(null, defaultContentForLang(language));
    set({ tabs: [...tabs, t], activeId: t.id });
    return t.id;
  },

  closeTab: (id) => {
    const { tabs, activeId, tabPositions, language } = get();
    if (tabs.length === 1) {
      const t = makeTab(null, defaultContentForLang(language));
      set({ tabs: [t], activeId: t.id, tabPositions: {} });
      return;
    }
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const next = tabs.filter((t) => t.id !== id);
    let newActive = activeId;
    if (activeId === id) {
      newActive = (next[idx] ?? next[idx - 1] ?? next[0]).id;
    }
    const nextPositions = { ...tabPositions };
    delete nextPositions[id];
    set({ tabs: next, activeId: newActive, tabPositions: nextPositions });
  },

  closeOthers: (id) => {
    const { tabs, tabPositions } = get();
    const keep = tabs.find((t) => t.id === id);
    if (!keep) return;
    const nextPositions = tabPositions[id]
      ? { [id]: tabPositions[id] }
      : {};
    set({ tabs: [keep], activeId: keep.id, tabPositions: nextPositions });
  },

  setActive: (id) => {
    if (get().tabs.some((t) => t.id === id)) set({ activeId: id });
  },

  replaceTabs: (tabs: Tab[], activeId: string) => {
    if (tabs.length === 0) return;
    // Drop position entries for tab ids that no longer exist.
    const keep = new Set(tabs.map((t) => t.id));
    const oldPositions = get().tabPositions;
    const nextPositions: Record<string, TabPosition> = {};
    for (const k of Object.keys(oldPositions)) {
      if (keep.has(k)) nextPositions[k] = oldPositions[k];
    }
    set({ tabs, activeId, tabPositions: nextPositions });
  },

  reorderTabs: (fromIdx, toIdx) => {
    const { tabs, activeId } = get();
    if (fromIdx < 0 || fromIdx >= tabs.length || toIdx < 0 || toIdx > tabs.length) return;
    // After splice(fromIdx, 1) + splice(toIdx, 0, ...), the tab only changes
    // position if the final index differs. When toIdx > fromIdx the final
    // position is toIdx - 1 (because the array shrunk by 1 before inserting).
    const finalPos = toIdx > fromIdx ? toIdx - 1 : toIdx;
    if (fromIdx === finalPos) return;
    const next = [...tabs];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    set({ tabs: next, activeId });
  },

  markSaved: () => {
    const { tabs, activeId } = get();
    set({
      tabs: tabs.map((t) =>
        t.id === activeId ? { ...t, savedContent: t.content } : t,
      ),
    });
  },

  setTabPosition: (id, pos) => {
    const cur = get().tabPositions;
    const prev = cur[id];
    if (
      prev &&
      prev.cursor === pos.cursor &&
      prev.scrollTopLine === pos.scrollTopLine
    ) {
      return;
    }
    set({ tabPositions: { ...cur, [id]: pos } });
  },

  setTabPositions: (positions) =>
    set({ tabPositions: { ...positions } }),

  addWorkspace: (path) => {
    const { workspaces } = get();
    if (workspaces.includes(path)) return;
    set({ workspaces: [...workspaces, path] });
  },

  removeWorkspace: (path) => {
    const { workspaces, expandedDirs } = get();
    // Drop expansion state for the removed root and any descendant we cached,
    // so the persisted map doesn't grow unbounded across project switches.
    const sep = path.includes("\\") && !path.includes("/") ? "\\" : "/";
    const prefix = path.endsWith(sep) ? path : path + sep;
    const nextExpanded: Record<string, boolean> = {};
    for (const k of Object.keys(expandedDirs)) {
      if (k !== path && !k.startsWith(prefix)) nextExpanded[k] = expandedDirs[k];
    }
    set({
      workspaces: workspaces.filter((w) => w !== path),
      expandedDirs: nextExpanded,
    });
  },

  setWorkspaces: (paths) => set({ workspaces: paths.slice() }),

  setTheme: (theme) => set({ theme }),
  setLanguage: (language) => {
    const cur = get();
    if (cur.language === language) return;
    // Also rewrite untouched untitled tabs that still hold the welcome doc, so
    // a user toggling languages right after launch sees the new welcome text.
    const oldDefault = defaultContentForLang(cur.language);
    const nextDefault = defaultContentForLang(language);
    const tabs = cur.tabs.map((t) =>
      t.filePath === null && t.content === oldDefault && t.savedContent === oldDefault
        ? { ...t, content: nextDefault, savedContent: nextDefault }
        : t,
    );
    set({ language, tabs });
  },
  togglePreview: () => {
    const next = !get().showPreview;
    // turning preview off also exits maximized
    set({ showPreview: next, previewMaximized: next ? get().previewMaximized : false });
  },
  togglePreviewMaximized: () => {
    const next = !get().previewMaximized;
    // entering maximized also turns preview on
    set({ previewMaximized: next, showPreview: next ? true : get().showPreview });
  },
  toggleSidebar: () => set({ showSidebar: !get().showSidebar }),
  setShowSidebar: (v) => set({ showSidebar: v }),
  setEditorFontSize: (px) =>
    set({ editorFontSize: Math.max(10, Math.min(28, Math.round(px))) }),
  isActiveDirty: () => {
    const { tabs, activeId } = get();
    const t = tabs.find((x) => x.id === activeId);
    return !!t && t.content !== t.savedContent;
  },
}));

export function useActiveTab(): Tab | null {
  return useEditorStore(
    (s) => s.tabs.find((t) => t.id === s.activeId) ?? null,
  );
}

export function isTabDirty(t: Tab): boolean {
  return t.content !== t.savedContent;
}
