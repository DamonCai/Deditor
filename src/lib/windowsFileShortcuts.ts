import { isEnabled, type ShortcutId } from "./shortcuts";

/** WebView2 owns Windows file shortcuts; the menu displays their hints only. */
export function handleWindowsFileShortcut(
  event: KeyboardEvent,
  preferences: Record<string, boolean>,
  run: (action: ShortcutId) => void,
  windows = /Windows/i.test(navigator.userAgent),
): boolean {
  if (!windows || !event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.defaultPrevented) return false;
  const key = event.key.toLowerCase();
  const action: ShortcutId | undefined = key === "n"
    ? (event.shiftKey ? "file_new_window" : "file_new")
    : key === "o" ? (event.shiftKey ? "file_open_folder" : "file_open")
    : key === "s" ? (event.shiftKey ? "file_save_as" : "file_save")
    : key === "w" && !event.shiftKey ? "file_close_tab" : undefined;
  if (!action || !isEnabled(preferences, action)) return false;
  event.preventDefault();
  run(action);
  return true;
}
