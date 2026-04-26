/** Shortcut registry — every key binding the user can toggle on/off lives
 *  here. Three layers exist:
 *
 *    - "menu"   accelerators baked into the native OS menu (Rust). Disabling
 *               drops the accelerator string when rebuilding the menu — the
 *               menu item itself stays clickable via mouse.
 *    - "app"    handlers in App.tsx's global keydown listener.
 *    - "editor" custom keymap entries we add into CodeMirror's keymap array.
 *
 *  CodeMirror's bundled `defaultKeymap` / `historyKeymap` / `searchKeymap`
 *  (Cmd+Z, Cmd+F, Cmd+D, Cmd+A, …) are intentionally NOT here: they're
 *  standard editor bindings that almost never conflict with system hotkeys,
 *  and individually filtering them out of the upstream keymap arrays would
 *  bloat this file with little payoff.
 */

export type ShortcutLayer = "menu" | "app" | "editor";

export type ShortcutId =
  // menu
  | "file_new"
  | "file_open"
  | "file_open_folder"
  | "file_save"
  | "file_save_as"
  | "file_close_tab"
  // app-level (frontend window listener)
  | "app_toggle_sidebar"
  | "app_goto_anything"
  | "app_command_palette"
  | "app_goto_symbol"
  | "app_find_in_files"
  | "app_open_settings"
  | "app_zen_mode"
  | "app_split_editor"
  // editor (CodeMirror custom keymap)
  | "editor_add_cursor_above"
  | "editor_add_cursor_below"
  | "editor_select_all_matches";

export interface ShortcutMeta {
  id: ShortcutId;
  /** What the user sees, e.g. "Cmd/Ctrl+N". Kept symbolic so we don't have to
   *  branch on platform. */
  display: string;
  /** i18n key for the human-readable description. */
  labelKey: string;
  /** Which subsystem owns the binding — drives where the on/off is applied. */
  layer: ShortcutLayer;
  /** Section heading in the Settings UI. */
  group: "file" | "nav" | "editor";
}

export const SHORTCUTS: ShortcutMeta[] = [
  // File
  { id: "file_new",          display: "Cmd/Ctrl+N",        labelKey: "shortcut.file.new",         layer: "menu",   group: "file" },
  { id: "file_open",         display: "Cmd/Ctrl+O",        labelKey: "shortcut.file.open",        layer: "menu",   group: "file" },
  { id: "file_open_folder",  display: "Cmd/Ctrl+Shift+O",  labelKey: "shortcut.file.openFolder",  layer: "menu",   group: "file" },
  { id: "file_save",         display: "Cmd/Ctrl+S",        labelKey: "shortcut.file.save",        layer: "menu",   group: "file" },
  { id: "file_save_as",      display: "Cmd/Ctrl+Shift+S",  labelKey: "shortcut.file.saveAs",      layer: "menu",   group: "file" },
  { id: "file_close_tab",    display: "Cmd/Ctrl+W",        labelKey: "shortcut.file.closeTab",    layer: "menu",   group: "file" },

  // Navigation
  { id: "app_goto_anything",   display: "Cmd/Ctrl+P",       labelKey: "shortcut.nav.gotoAnything",   layer: "app", group: "nav" },
  { id: "app_command_palette", display: "Cmd/Ctrl+Shift+P", labelKey: "shortcut.nav.commandPalette", layer: "app", group: "nav" },
  { id: "app_goto_symbol",     display: "Cmd/Ctrl+R",       labelKey: "shortcut.nav.gotoSymbol",     layer: "app", group: "nav" },
  { id: "app_find_in_files",   display: "Cmd/Ctrl+Shift+F", labelKey: "shortcut.nav.findInFiles",    layer: "app", group: "nav" },
  { id: "app_toggle_sidebar",  display: "Cmd/Ctrl+B",       labelKey: "shortcut.nav.toggleSidebar",  layer: "app", group: "nav" },
  { id: "app_open_settings",   display: "Cmd/Ctrl+,",       labelKey: "shortcut.nav.openSettings",   layer: "app", group: "nav" },
  { id: "app_zen_mode",        display: "Cmd/Ctrl+K",       labelKey: "shortcut.nav.zenMode",        layer: "app", group: "nav" },
  { id: "app_split_editor",    display: "Cmd/Ctrl+\\",      labelKey: "shortcut.nav.splitEditor",    layer: "app", group: "nav" },

  // Editor
  { id: "editor_add_cursor_above",    display: "Cmd/Ctrl+Alt+↑",  labelKey: "shortcut.editor.addCursorAbove",    layer: "editor", group: "editor" },
  { id: "editor_add_cursor_below",    display: "Cmd/Ctrl+Alt+↓",  labelKey: "shortcut.editor.addCursorBelow",    layer: "editor", group: "editor" },
  { id: "editor_select_all_matches",  display: "Cmd/Ctrl+Shift+L", labelKey: "shortcut.editor.selectAllMatches",  layer: "editor", group: "editor" },
];

export const DEFAULT_SHORTCUTS: Record<ShortcutId, boolean> = SHORTCUTS.reduce(
  (acc, s) => {
    acc[s.id] = true;
    return acc;
  },
  {} as Record<ShortcutId, boolean>,
);

/** True if the binding is currently enabled. Unknown ids default to true so a
 *  newly-added shortcut works for users who upgrade without a profile reset. */
export function isEnabled(prefs: Record<string, boolean>, id: ShortcutId): boolean {
  return prefs[id] !== false;
}
