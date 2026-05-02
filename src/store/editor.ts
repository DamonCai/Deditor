import { create } from "zustand";
import { DEFAULT_SHORTCUTS, type ShortcutId } from "../lib/shortcuts";
import { isBinaryRenderable } from "../lib/lang";

export type Theme = "light" | "dark";
export type Lang = "zh" | "en";

/** A closed tab snapshot, just enough state to bring it back via Cmd+Shift+T.
 *  We don't persist these across launches — the stack is a session feature. */
export interface ClosedTabRecord {
  filePath: string | null;
  /** Held only for untitled tabs (no filePath) and dirty named tabs that the
   *  user explicitly chose not to save. Named tabs reopen via the regular
   *  read-from-disk path so the user gets the latest on-disk content. */
  content: string;
  savedContent: string;
  cursor?: number;
  scrollTopLine?: number;
}

const REOPEN_STACK_MAX = 20;

export interface DiffSpec {
  leftPath: string;
  rightPath: string;
  leftContent: string;
  rightContent: string;
}

export interface LogSpec {
  workspace: string;
  /** Optional pre-applied filter — e.g. opened from "Show File History"
   *  with a path filter set. The panel can still mutate filters via its
   *  own toolbar. */
  initialPath?: string;
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
  /** When set, this tab renders the Git Log panel for `log.workspace`. Like
   *  diff tabs, the file-path / content fields are ignored. */
  log?: LogSpec;
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
  /** Workspace root the user most recently engaged with via the file tree
   *  (clicked the workspace header / a folder under it). Drives the StatusBar
   *  git branch — without this, branchOwner falls back to the active tab's
   *  workspace, which is wrong when the user navigates folders without
   *  opening a file. Reset to null when a workspace is removed. */
  focusedWorkspace: string | null;
  /** Which left-side tool window is showing — Project (file tree) or Commit
   *  (changes list + commit message). Switched via the ActivityBar. */
  leftPanel: "files" | "commit";
  /** Per-workspace draft commit message. Persisted so closing/reopening the
   *  app doesn't lose a half-written message. */
  commitDrafts: Record<string, string>;
  /** Per-workspace amend toggle in the commit panel. Not persisted — amend
   *  is a deliberate per-commit decision and surviving restart would invite
   *  accidental amends. */
  commitAmend: Record<string, boolean>;
  /** Per-workspace explicitly UNCHECKED files (relative paths). Inverted so
   *  the default for a newly-changed file is "checked" — matches JetBrains
   *  where every changed file ships in the next commit by default. */
  commitUnchecked: Record<string, string[]>;
  /** Per-workspace commit options — the gear menu in the panel. Persisted
   *  except for `authorOverride` which is one-shot per session. */
  commitOptions: Record<
    string,
    {
      signoff?: boolean;
      allowEmpty?: boolean;
      authorOverride?: string;
    }
  >;
  /** Recent commit messages, most-recent-first. Persisted across launches
   *  so the panel's Cmd+↑ history works after restart. Capped at 30. */
  commitMessageHistory: string[];
  /** CommitPanel view-mode toggle. Persisted. */
  commitViewMode: "tree" | "flat";
  /** Diff viewer mode — JetBrains "Side-by-side viewer" vs "Unified viewer". */
  diffViewMode: "side" | "unified";
  /** Whitespace handling in the diff comparator. */
  diffIgnoreWhitespace: "none" | "leading" | "all";
  /** Highlight changed words within a "modified" row pair. */
  diffHighlightWords: boolean;
  /** Collapse long runs of unchanged lines into an expandable placeholder. */
  diffCollapseUnchanged: boolean;
  /** VCS gutter modification markers (green/blue/red bars per line). */
  gutterMarkers: boolean;
  /** Append "Author · 2 days ago · sha" to the cursor line in dim text. */
  inlineBlame: boolean;
  /** Auto-run `git fetch --all --prune` on a timer per workspace. */
  bgFetchEnabled: boolean;
  bgFetchIntervalMin: number;
  /** Counter that bumps each time something asks the CommitPanel to take
   *  focus (Cmd+K, Git menu's "Commit Directory…", etc.). The panel
   *  subscribes and re-focuses its message textarea on change. */
  commitFocusVersion: number;
  /** Phase 3 modal dialogs. Single open-at-a-time slot — opening one
   *  closes whichever was previously open. Each dialog reads its own
   *  workspace from `focusedWorkspace` (or, for resetHead, an explicit
   *  initialRef passed via the slot payload). */
  gitDialog:
    | { kind: "push"; workspace: string }
    | { kind: "stash"; workspace: string }
    | { kind: "remotes"; workspace: string }
    | { kind: "resetHead"; workspace: string; initialRef?: string }
    | { kind: "conflicts"; workspace: string; state: string }
    | { kind: "init" }
    | { kind: "clone" }
    | { kind: "tags"; workspace: string }
    | { kind: "createPatch"; workspace: string }
    | { kind: "applyPatch"; workspace: string }
    | null;
  /** Total characters currently selected in the active editor (sum across
   *  all ranges if multi-cursor). 0 when no selection. Not persisted —
   *  selection state shouldn't survive a restart. */
  activeSelectionLength: number;
  /** LIFO stack of recently-closed tabs, used by Cmd+Shift+T to reopen.
   *  Capped at REOPEN_STACK_MAX entries. Diff tabs and binary-renderable
   *  files (image / pdf / audio / video / hex) are not pushed — diff is
   *  ephemeral and binary content as data URLs would bloat memory. */
  closedTabsStack: ClosedTabRecord[];
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
  /** Auto-close brackets / quotes (CodeMirror's `closeBrackets` extension). */
  autoCloseBrackets: boolean;
  /** Split the editor area into two side-by-side views of the same active
   *  tab (independent cursor + scroll). Toggled via the command palette /
   *  shortcut. Tab list itself is unchanged — both views read the same tab. */
  splitEditor: boolean;
  /** Distraction-free mode hides the title bar, tab bar, sidebar, status
   *  bar — only the editor (and Markdown preview if active) remain. Toggled
   *  via Cmd+K Z (matches VSCode "Zen Mode") or via the command palette. */
  zenMode: boolean;
  /** Show the bottom integrated-terminal panel. Toggled via Ctrl+`. */
  terminalOpen: boolean;
  /** Maximize the terminal panel — when true, it occupies the full editor
   *  area instead of just the bottom strip. Independent from terminalOpen. */
  terminalMaximized: boolean;
  /** Optional shell override; empty string means "use $SHELL / %COMSPEC%". */
  terminalShell: string;
  /** Stable React keys for each open terminal session. PTY ids are owned by
   *  individual TerminalPane instances; these keys just drive the tab strip
   *  and survive the panel being hidden. Spawning a new session pushes; the
   *  panel closes when the array is empty. Not persisted (PTYs don't survive
   *  restart, so re-opening the panel always starts with one fresh session). */
  terminalSessions: string[];
  /** Currently visible terminal session key. Hidden sessions stay mounted
   *  (display:none) so their PTYs keep streaming output into xterm's buffer. */
  activeTerminalId: string | null;
  /** sessionKey → initial cwd the session was spawned in. Used to dedupe
   *  per-workspace terminals (BranchPopover "checkout in terminal" reuses
   *  an existing session for the same workspace instead of piling up
   *  duplicates). Empty when the session was opened without a cwd hint. */
  terminalSessionCwds: Record<string, string>;
  /** Auto-save: "off" | "onBlur" | "afterDelay". afterDelay debounces 1.5s
   *  after the user stops typing. onBlur saves when the window loses focus. */
  autoSave: "off" | "onBlur" | "afterDelay";
  /** Run Prettier before writing supported files to disk. Off by default —
   *  format-on-save is opinionated and surprising for users with their own
   *  formatter setup. */
  formatOnSave: boolean;

  setContent: (content: string, tabId?: string) => void;
  // Open a new tab (or focus existing one for the same path).
  openTab: (filePath: string | null, content: string) => string;
  // Open a side-by-side diff tab. Dedupes on (leftPath, rightPath).
  openDiffTab: (spec: DiffSpec) => string;
  /** Open (or focus) the Git Log tab for a workspace. Single tab per
   *  workspace + filter combo — opening with a different path filter pushes
   *  a new tab so File History queries don't replace the global log view. */
  openLogTab: (spec: LogSpec) => string;
  setCompareMarkPath: (path: string | null) => void;
  setFocusedWorkspace: (path: string | null) => void;
  setLeftPanel: (p: "files" | "commit") => void;
  setCommitDraft: (workspace: string, message: string) => void;
  setCommitAmend: (workspace: string, on: boolean) => void;
  setCommitChecked: (workspace: string, rel: string, checked: boolean) => void;
  /** Reset the unchecked set for the workspace — called after a successful
   *  commit so newly-changed files default to checked again. */
  clearCommitUnchecked: (workspace: string) => void;
  setCommitOption: (
    workspace: string,
    patch: Partial<{
      signoff: boolean;
      allowEmpty: boolean;
      authorOverride: string;
    }>,
  ) => void;
  /** Push a freshly-committed message onto the history stack. Dedupes
   *  identical messages, keeps the 30 most recent. */
  pushCommitMessage: (msg: string) => void;
  setCommitViewMode: (m: "tree" | "flat") => void;
  setDiffViewMode: (m: "side" | "unified") => void;
  setDiffIgnoreWhitespace: (m: "none" | "leading" | "all") => void;
  setDiffHighlightWords: (v: boolean) => void;
  setDiffCollapseUnchanged: (v: boolean) => void;
  setGutterMarkers: (v: boolean) => void;
  setInlineBlame: (v: boolean) => void;
  setBgFetchEnabled: (v: boolean) => void;
  setBgFetchIntervalMin: (n: number) => void;
  /** One-shot "show Commit panel + focus me" trigger. Forces the sidebar
   *  visible (in case the user collapsed it), switches the active tool
   *  window to commit, and bumps the focus counter so the panel grabs
   *  focus on its message textarea. */
  openCommitPanel: () => void;
  openGitDialog: (
    spec: NonNullable<EditorState["gitDialog"]>,
  ) => void;
  closeGitDialog: () => void;
  setActiveSelectionLength: (n: number) => void;
  /** Push a closed-tab snapshot onto the reopen stack. Called by `closeTab`;
   *  exported so external code (e.g. workspace removal) can also enqueue. */
  pushClosedTab: (record: ClosedTabRecord) => void;
  /** Pop and return the most recently closed tab. The caller handles the
   *  actual reopen so the store stays free of IPC. */
  popClosedTab: () => ClosedTabRecord | null;
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
  setAutoCloseBrackets: (on: boolean) => void;
  toggleSplitEditor: () => void;
  setTerminalOpen: (v: boolean) => void;
  toggleTerminal: () => void;
  setTerminalMaximized: (v: boolean) => void;
  setTerminalShell: (s: string) => void;
  /** Spawn a new terminal session and make it active. Returns the new key.
   *  Optional cwd is stashed in `terminalSessionCwds` so the pane uses it
   *  for `term_open` and so subsequent same-workspace lookups can dedupe. */
  addTerminalSession: (cwd?: string) => string;
  /** Find an existing session opened with this workspace cwd; if none,
   *  spawn one. Either way the session becomes active. Used by the branch
   *  popover so clicking "checkout in terminal" for a different workspace
   *  doesn't paste into the wrong-cwd session. */
  openTerminalForWorkspace: (workspace: string) => string;
  /** Close a session by key. If it was active, picks a neighbor; if it was
   *  the last one, closes the panel as a whole. */
  closeTerminalSession: (key: string) => void;
  setActiveTerminal: (key: string) => void;
  setSplitEditor: (on: boolean) => void;
  toggleZenMode: () => void;
  setZenMode: (on: boolean) => void;
  setAutoSave: (mode: "off" | "onBlur" | "afterDelay") => void;
  setFormatOnSave: (on: boolean) => void;
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
- \`Cmd/Ctrl+Shift+T\` 重新打开最近关闭的标签 —— **任何类型**（文本 / 图片 / PDF / 音视频 / 二进制），**可连按**回溯多个
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
- \`Cmd/Ctrl+Shift+T\` Reopen the most recently closed tab — **any type** (text / image / PDF / audio / video / binary); **press repeatedly** to walk back
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

let terminalCounter = 0;
function newTerminalKey(): string {
  // Counter-based id keeps the React key short and stable, which makes the
  // tab strip ("Terminal 1 / 2 / 3") read naturally without us tracking a
  // separate label-per-session map.
  terminalCounter += 1;
  return `term-${terminalCounter}`;
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
  focusedWorkspace: null,
  leftPanel: "files",
  commitDrafts: {},
  commitAmend: {},
  commitUnchecked: {},
  commitFocusVersion: 0,
  gitDialog: null,
  commitOptions: {},
  commitMessageHistory: [],
  commitViewMode: "tree",
  diffViewMode: "side",
  diffIgnoreWhitespace: "none",
  diffHighlightWords: true,
  diffCollapseUnchanged: true,
  gutterMarkers: true,
  inlineBlame: false,
  bgFetchEnabled: true,
  bgFetchIntervalMin: 5,
  activeSelectionLength: 0,
  closedTabsStack: [],
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
  autoCloseBrackets: true,
  splitEditor: false,
  zenMode: false,
  terminalOpen: false,
  terminalMaximized: false,
  terminalShell: "",
  terminalSessions: [],
  activeTerminalId: null,
  terminalSessionCwds: {},
  autoSave: "off",
  formatOnSave: false,

  setContent: (content, tabId) => {
    const { tabs, activeId } = get();
    const target = tabId ?? activeId;
    set({
      tabs: tabs.map((t) => (t.id === target ? { ...t, content } : t)),
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

  openLogTab: (spec) => {
    const { tabs } = get();
    // Dedupe: same workspace + same path filter → focus existing.
    const existing = tabs.find(
      (t) =>
        t.log &&
        t.log.workspace === spec.workspace &&
        (t.log.initialPath ?? "") === (spec.initialPath ?? ""),
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
      log: spec,
    };
    set({ tabs: [...tabs, t], activeId: t.id });
    return t.id;
  },

  setCompareMarkPath: (path) => set({ compareMarkPath: path }),
  setFocusedWorkspace: (path) => set({ focusedWorkspace: path }),
  setLeftPanel: (p) => set({ leftPanel: p }),
  setCommitDraft: (workspace, message) => {
    const { commitDrafts } = get();
    set({ commitDrafts: { ...commitDrafts, [workspace]: message } });
  },
  setCommitAmend: (workspace, on) => {
    const { commitAmend } = get();
    set({ commitAmend: { ...commitAmend, [workspace]: on } });
  },
  setCommitChecked: (workspace, rel, checked) => {
    const { commitUnchecked } = get();
    const cur = commitUnchecked[workspace] ?? [];
    const next = checked ? cur.filter((x) => x !== rel) : (cur.includes(rel) ? cur : [...cur, rel]);
    set({ commitUnchecked: { ...commitUnchecked, [workspace]: next } });
  },
  clearCommitUnchecked: (workspace) => {
    const { commitUnchecked } = get();
    if (!(workspace in commitUnchecked)) return;
    const { [workspace]: _, ...rest } = commitUnchecked;
    set({ commitUnchecked: rest });
  },
  openCommitPanel: () => {
    const s = get();
    set({
      showSidebar: true,
      leftPanel: "commit",
      commitFocusVersion: s.commitFocusVersion + 1,
    });
  },
  openGitDialog: (spec) => set({ gitDialog: spec }),
  closeGitDialog: () => set({ gitDialog: null }),
  setCommitOption: (workspace, patch) => {
    const { commitOptions } = get();
    const cur = commitOptions[workspace] ?? {};
    set({
      commitOptions: { ...commitOptions, [workspace]: { ...cur, ...patch } },
    });
  },
  pushCommitMessage: (msg) => {
    const trimmed = msg.trim();
    if (!trimmed) return;
    const { commitMessageHistory } = get();
    const dedup = commitMessageHistory.filter((m) => m !== trimmed);
    const next = [trimmed, ...dedup].slice(0, 30);
    set({ commitMessageHistory: next });
  },
  setCommitViewMode: (m) => set({ commitViewMode: m }),
  setDiffViewMode: (m) => set({ diffViewMode: m }),
  setDiffIgnoreWhitespace: (m) => set({ diffIgnoreWhitespace: m }),
  setDiffHighlightWords: (v) => set({ diffHighlightWords: v }),
  setDiffCollapseUnchanged: (v) => set({ diffCollapseUnchanged: v }),
  setGutterMarkers: (v) => set({ gutterMarkers: v }),
  setInlineBlame: (v) => set({ inlineBlame: v }),
  setBgFetchEnabled: (v) => set({ bgFetchEnabled: v }),
  setBgFetchIntervalMin: (n) =>
    set({ bgFetchIntervalMin: Math.max(1, Math.min(60, Math.round(n))) }),

  setActiveSelectionLength: (n) => {
    if (get().activeSelectionLength === n) return;
    set({ activeSelectionLength: n });
  },

  pushClosedTab: (record) => {
    const next = [...get().closedTabsStack, record].slice(-REOPEN_STACK_MAX);
    set({ closedTabsStack: next });
  },
  popClosedTab: () => {
    const stack = get().closedTabsStack;
    if (stack.length === 0) return null;
    const record = stack[stack.length - 1];
    set({ closedTabsStack: stack.slice(0, -1) });
    return record;
  },

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
  setAutoCloseBrackets: (on) => set({ autoCloseBrackets: on }),
  toggleSplitEditor: () => set({ splitEditor: !get().splitEditor }),
  setSplitEditor: (on) => set({ splitEditor: on }),
  setTerminalOpen: (v) => {
    const { terminalSessions } = get();
    if (v && terminalSessions.length === 0) {
      // First open ever: seed a single session so the panel has something to
      // show. Subsequent toggles preserve whatever sessions are already there.
      const id = newTerminalKey();
      set({ terminalOpen: true, terminalSessions: [id], activeTerminalId: id });
    } else {
      set({ terminalOpen: v });
    }
  },
  toggleTerminal: () => {
    const { terminalOpen, terminalSessions } = get();
    if (!terminalOpen && terminalSessions.length === 0) {
      const id = newTerminalKey();
      set({ terminalOpen: true, terminalSessions: [id], activeTerminalId: id });
    } else {
      set({ terminalOpen: !terminalOpen });
    }
  },
  setTerminalMaximized: (v) => set({ terminalMaximized: v }),
  setTerminalShell: (s) => set({ terminalShell: s }),
  addTerminalSession: (cwd) => {
    const id = newTerminalKey();
    const { terminalSessions, terminalSessionCwds } = get();
    set({
      terminalSessions: [...terminalSessions, id],
      activeTerminalId: id,
      terminalOpen: true,
      terminalSessionCwds: cwd
        ? { ...terminalSessionCwds, [id]: cwd }
        : terminalSessionCwds,
    });
    return id;
  },
  openTerminalForWorkspace: (workspace) => {
    const { terminalSessions, terminalSessionCwds } = get();
    // Reuse first existing session that was spawned in this workspace —
    // avoids piling up duplicates each time the user opens the popover.
    const existing = terminalSessions.find(
      (k) => terminalSessionCwds[k] === workspace,
    );
    if (existing) {
      set({ activeTerminalId: existing, terminalOpen: true });
      return existing;
    }
    return get().addTerminalSession(workspace);
  },
  closeTerminalSession: (key) => {
    const { terminalSessions, activeTerminalId, terminalOpen, terminalSessionCwds } = get();
    const idx = terminalSessions.indexOf(key);
    if (idx < 0) return;
    const next = terminalSessions.filter((k) => k !== key);
    let nextActive = activeTerminalId;
    if (activeTerminalId === key) {
      // Pick the neighbor on the right; fall back to the left, else null.
      nextActive = next[idx] ?? next[idx - 1] ?? null;
    }
    const { [key]: _dropped, ...nextCwds } = terminalSessionCwds;
    set({
      terminalSessions: next,
      activeTerminalId: nextActive,
      terminalSessionCwds: nextCwds,
      // When the last session closes, also hide the panel — the chrome alone
      // is meaningless and would just take vertical space.
      terminalOpen: next.length === 0 ? false : terminalOpen,
    });
  },
  setActiveTerminal: (key) => {
    const { terminalSessions } = get();
    if (terminalSessions.includes(key)) set({ activeTerminalId: key });
  },
  toggleZenMode: () => set({ zenMode: !get().zenMode }),
  setZenMode: (on) => set({ zenMode: on }),
  setAutoSave: (mode) => set({ autoSave: mode }),
  setFormatOnSave: (on) => set({ formatOnSave: on }),

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
    const { tabs, activeId, tabPositions, language, closedTabsStack } = get();
    const closingTab = tabs.find((t) => t.id === id);
    // Push every closed tab onto the reopen stack except diff tabs (those are
    // ephemeral by design). Binary-rendered tabs (image / PDF / audio / video
    // / hex) get pushed with content blanked — `openFileByPath` re-reads from
    // disk on reopen, so we don't need to carry the data URL around.
    const reopenWorthy = closingTab && !closingTab.diff;
    const isBinary = closingTab && isBinaryRenderable(closingTab.filePath);
    const newStack = reopenWorthy
      ? [
          ...closedTabsStack,
          {
            filePath: closingTab.filePath,
            content: isBinary ? "" : closingTab.content,
            savedContent: isBinary ? "" : closingTab.savedContent,
            cursor: tabPositions[id]?.cursor,
            scrollTopLine: tabPositions[id]?.scrollTopLine,
          },
        ].slice(-REOPEN_STACK_MAX)
      : closedTabsStack;
    if (tabs.length === 1) {
      const t = makeTab(null, defaultContentForLang(language));
      set({ tabs: [t], activeId: t.id, tabPositions: {}, closedTabsStack: newStack });
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
    set({
      tabs: next,
      activeId: newActive,
      tabPositions: nextPositions,
      closedTabsStack: newStack,
    });
  },

  closeOthers: (id) => {
    const { tabs, tabPositions, closedTabsStack } = get();
    const keep = tabs.find((t) => t.id === id);
    if (!keep) return;
    // Push every other tab onto the reopen stack, in tab-order so popping
    // reverses left-to-right (rightmost reopens first). Diff tabs skipped;
    // binary tabs go in with content blanked (reopen reads from disk).
    const records: ClosedTabRecord[] = [];
    for (const t of tabs) {
      if (t.id === id) continue;
      if (t.diff) continue;
      const isBinary = isBinaryRenderable(t.filePath);
      records.push({
        filePath: t.filePath,
        content: isBinary ? "" : t.content,
        savedContent: isBinary ? "" : t.savedContent,
        cursor: tabPositions[t.id]?.cursor,
        scrollTopLine: tabPositions[t.id]?.scrollTopLine,
      });
    }
    const newStack = [...closedTabsStack, ...records].slice(-REOPEN_STACK_MAX);
    const nextPositions = tabPositions[id]
      ? { [id]: tabPositions[id] }
      : {};
    set({
      tabs: [keep],
      activeId: keep.id,
      tabPositions: nextPositions,
      closedTabsStack: newStack,
    });
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
    const { workspaces, expandedDirs, focusedWorkspace } = get();
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
      focusedWorkspace: focusedWorkspace === path ? null : focusedWorkspace,
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
