import { create } from "zustand";

export type Theme = "light" | "dark";

export interface Tab {
  id: string;
  filePath: string | null;
  content: string;
  savedContent: string;
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
  showPreview: boolean;
  showSidebar: boolean;
  previewMaximized: boolean;
  editorFontSize: number;

  setContent: (content: string) => void;
  // Open a new tab (or focus existing one for the same path).
  openTab: (filePath: string | null, content: string) => string;
  // Replace active tab's file (used when "Save As" rebinds path).
  rebindActive: (filePath: string, content: string) => void;
  newUntitled: () => string;
  closeTab: (id: string) => void;
  closeOthers: (id: string) => void;
  setActive: (id: string) => void;
  replaceTabs: (tabs: Tab[], activeId: string) => void;
  markSaved: () => void;

  setTabPosition: (id: string, pos: TabPosition) => void;
  setTabPositions: (positions: Record<string, TabPosition>) => void;

  addWorkspace: (path: string) => void;
  removeWorkspace: (path: string) => void;
  setWorkspaces: (paths: string[]) => void;

  setTheme: (theme: Theme) => void;
  togglePreview: () => void;
  togglePreviewMaximized: () => void;
  toggleSidebar: () => void;
  setShowSidebar: (v: boolean) => void;
  setEditorFontSize: (px: number) => void;
  isActiveDirty: () => boolean;
}

export const DEFAULT_CONTENT = `# 欢迎使用 DEditor

这是一个基于 **Tauri + React + CodeMirror** 的 Markdown / 多语言代码编辑器。

## 快捷键

- \`Cmd/Ctrl+N\` 新建标签
- \`Cmd/Ctrl+O\` 打开文件（可多选）
- \`Cmd/Ctrl+Shift+O\` 打开文件夹
- \`Cmd/Ctrl+S\` 保存
- \`Cmd/Ctrl+W\` 关闭当前标签
- \`Cmd/Ctrl+B\` 开关侧栏
- 拖拽文件到窗口可直接打开

## 代码示例

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`
`;

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
  showPreview: true,
  showSidebar: true,
  previewMaximized: false,
  editorFontSize: 14,

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
    const { tabs } = get();
    const t = makeTab(null, DEFAULT_CONTENT);
    set({ tabs: [...tabs, t], activeId: t.id });
    return t.id;
  },

  closeTab: (id) => {
    const { tabs, activeId, tabPositions } = get();
    if (tabs.length === 1) {
      const t = makeTab(null, DEFAULT_CONTENT);
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
    const { workspaces } = get();
    set({ workspaces: workspaces.filter((w) => w !== path) });
  },

  setWorkspaces: (paths) => set({ workspaces: paths.slice() }),

  setTheme: (theme) => set({ theme }),
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
