/** Command Palette registry. Each command is a discoverable, runnable action
 *  the user can find via Cmd+Shift+P. We keep the list small and focused: app
 *  actions that have meaningful keyboard / menu equivalents elsewhere. CodeMirror
 *  text-editing commands (which Sublime would also expose) come from the bundled
 *  keymaps, and aren't useful out of editor context, so we don't relist them.
 */

import {
  closeActiveTab,
  newFile,
  openFile,
  openFolder,
  reopenLastClosedTab,
  saveFile,
  saveFileAs,
} from "./fileio";
import { useEditorStore } from "../store/editor";

export interface Command {
  id: string;
  /** i18n key for the visible label. */
  labelKey: string;
  /** Optional shortcut text shown on the right of the row. Symbolic
   *  ("Cmd/Ctrl+P") rather than platform-rendered to keep us platform-neutral. */
  shortcut?: string;
  /** Group heading for the palette list. */
  group: "file" | "view" | "nav" | "editor";
  run: () => void | Promise<void>;
}

export const COMMANDS: Command[] = [
  // File
  { id: "cmd.file.new",          labelKey: "cmd.file.new",          shortcut: "Cmd/Ctrl+N",        group: "file", run: () => void newFile() },
  { id: "cmd.file.open",         labelKey: "cmd.file.open",         shortcut: "Cmd/Ctrl+O",        group: "file", run: () => void openFile() },
  { id: "cmd.file.openFolder",   labelKey: "cmd.file.openFolder",   shortcut: "Cmd/Ctrl+Shift+O",  group: "file", run: () => void openFolder() },
  { id: "cmd.file.save",         labelKey: "cmd.file.save",         shortcut: "Cmd/Ctrl+S",        group: "file", run: () => void saveFile() },
  { id: "cmd.file.saveAs",       labelKey: "cmd.file.saveAs",       shortcut: "Cmd/Ctrl+Shift+S",  group: "file", run: () => void saveFileAs() },
  { id: "cmd.file.closeTab",     labelKey: "cmd.file.closeTab",     shortcut: "Cmd/Ctrl+W",        group: "file", run: () => void closeActiveTab() },
  { id: "cmd.file.reopen",       labelKey: "cmd.file.reopen",       shortcut: "Cmd/Ctrl+Shift+T",  group: "file", run: () => void reopenLastClosedTab() },

  // View
  {
    id: "cmd.view.toggleSidebar",
    labelKey: "cmd.view.toggleSidebar",
    shortcut: "Cmd/Ctrl+B",
    group: "view",
    run: () => useEditorStore.getState().toggleSidebar(),
  },
  {
    id: "cmd.view.togglePreview",
    labelKey: "cmd.view.togglePreview",
    group: "view",
    run: () => useEditorStore.getState().togglePreview(),
  },
  {
    id: "cmd.view.toggleTheme",
    labelKey: "cmd.view.toggleTheme",
    group: "view",
    run: () => {
      const s = useEditorStore.getState();
      s.setTheme(s.theme === "dark" ? "light" : "dark");
    },
  },
  {
    id: "cmd.view.toggleSoftWrap",
    labelKey: "cmd.view.toggleSoftWrap",
    group: "view",
    run: () => {
      const s = useEditorStore.getState();
      s.setSoftWrap(!s.softWrap);
    },
  },
  {
    id: "cmd.view.toggleLanguage",
    labelKey: "cmd.view.toggleLanguage",
    group: "view",
    run: () => {
      const s = useEditorStore.getState();
      s.setLanguage(s.language === "zh" ? "en" : "zh");
    },
  },
  {
    id: "cmd.view.toggleZen",
    labelKey: "cmd.view.toggleZen",
    shortcut: "Cmd/Ctrl+K",
    group: "view",
    run: () => useEditorStore.getState().toggleZenMode(),
  },
  {
    id: "cmd.view.toggleSplit",
    labelKey: "cmd.view.toggleSplit",
    shortcut: "Cmd/Ctrl+\\",
    group: "view",
    run: () => useEditorStore.getState().toggleSplitEditor(),
  },

  // Navigation
  {
    id: "cmd.nav.gotoAnything",
    labelKey: "cmd.nav.gotoAnything",
    shortcut: "Cmd/Ctrl+P",
    group: "nav",
    run: () => useEditorStore.getState().setGotoAnythingOpen(true),
  },
  {
    id: "cmd.nav.gotoSymbol",
    labelKey: "cmd.nav.gotoSymbol",
    shortcut: "Cmd/Ctrl+R",
    group: "nav",
    run: () => useEditorStore.getState().setGotoSymbolOpen(true),
  },
  {
    id: "cmd.nav.findInFiles",
    labelKey: "cmd.nav.findInFiles",
    shortcut: "Cmd/Ctrl+Shift+F",
    group: "nav",
    run: () => useEditorStore.getState().setFindInFilesOpen(true),
  },
  {
    id: "cmd.nav.openSettings",
    labelKey: "cmd.nav.openSettings",
    shortcut: "Cmd/Ctrl+,",
    group: "nav",
    run: () => useEditorStore.getState().setSettingsOpen(true),
  },
];
