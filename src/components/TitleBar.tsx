import { memo, useEffect } from "react";
import { useActiveTabHeader } from "../store/editor";
import { useEditorStore } from "../store/editor";
import { useT } from "../lib/i18n";
// @tauri-apps/api/window is a ~62 KB barrel that ships the full Window class
// (monitors, position math, dozens of methods we don't use). We only need
// two calls; invoke them via the plugin protocol directly through the
// already-bundled core/invoke. Saves the entire barrel from the main chunk.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { FiSettings, FiSearch, FiSun, FiMoon, FiSidebar } from "react-icons/fi";
import { Button } from "./ui/Button";
import { logError } from "../lib/logger";
function currentWindowLabel(): string {
  return (window as any).__TAURI_INTERNALS__?.metadata?.currentWindow?.label ?? "main";
}

// macOS draws native traffic lights in the overlay; titlebar--mac reserves
// their space, including in fullscreen so the toolbar does not jump sideways.
const IS_MAC =
  typeof navigator !== "undefined" &&
  /(Mac|iPad|iPhone|iPod)/i.test(navigator.userAgent);

// data-tauri-drag-region only fires when the literal mousedown target carries
// the attribute — it does not bubble. Imperatively starting the drag from a
// single root mousedown handler is more robust: any descendant that isn't an
// interactive control (button, input, link) becomes a drag handle.
function onTitleBarMouseDown(e: React.MouseEvent<HTMLDivElement>) {
  if (e.button !== 0) return;
  const target = e.target as HTMLElement;
  if (target.closest("button, a, input, textarea, select, [role='button']")) {
    return;
  }
  if (e.detail === 2) {
    void invoke("plugin:window|toggle_maximize", { label: currentWindowLabel() });
    return;
  }
  void invoke("plugin:window|start_dragging", { label: currentWindowLabel() });
}

/** IntelliJ-style Main Toolbar. Sidebar toggle on the left, current file name in
 *  the middle (which also acts as the window drag handle), global actions
 *  (search / settings) on the right.
 *
 *  We don't ship git / run config like IntelliJ does — DEditor isn't an IDE —
 *  so the toolbar stays narrow and uncluttered. */
// Zero props — wrap in memo so when App re-renders for unrelated reasons
// (scroll-sync state, splitter drag, etc.) this whole chrome component
// short-circuits instead of re-running all its hooks. The component's own
// store subscriptions still wake it when its fields actually change.
function TitleBarImpl() {
  useEffect(() => {
    if (!IS_MAC || !isTauri()) return;
    const setVisible = (visible: boolean) => {
      void invoke("set_titlebar_visible", { visible }).catch((err) =>
        logError("Update native titlebar visibility failed", err),
      );
    };
    setVisible(true);
    return () => setVisible(false);
  }, []);
  const t = useT();
  const header = useActiveTabHeader();
  const setSettingsOpen = useEditorStore((s) => s.setSettingsOpen);
  const setGotoAnythingOpen = useEditorStore((s) => s.setGotoAnythingOpen);
  const showSidebar = useEditorStore((s) => s.showSidebar);
  const toggleSidebar = useEditorStore((s) => s.toggleSidebar);
  const theme = useEditorStore((s) => s.theme);
  const setTheme = useEditorStore((s) => s.setTheme);
  const name = header?.filePath
    ? header.filePath.split(/[\\/]/).pop()
    : t("common.untitled");
  const dirty = header?.dirty ?? false;

  return (
    <div
      className={`titlebar${IS_MAC ? " titlebar--mac" : ""}`}
      onMouseDown={onTitleBarMouseDown}
    >
      <Button
        variant="ghost"
        size="iconLg"
        title={t("shortcut.nav.toggleSidebar")}
        pressed={showSidebar}
        onClick={toggleSidebar}
      >
        <FiSidebar size={16} />
      </Button>

      <div className="titlebar-document">
        <span className="titlebar-filename" title={header?.filePath ?? name}>
          {name}
        </span>
        {dirty && <span className="titlebar-dirty" />}
      </div>

      <div className="titlebar-actions">
        <Button
          variant="ghost"
          size="iconLg"
          title={t("shortcut.nav.gotoAnything")}
          onClick={() => setGotoAnythingOpen(true)}
        >
          <FiSearch size={16} />
        </Button>
        <Button
          variant="ghost"
          size="iconLg"
          title={t(theme === "dark" ? "titlebar.toLight" : "titlebar.toDark")}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <FiSun size={16} /> : <FiMoon size={16} />}
        </Button>
        <Button
          variant="ghost"
          size="iconLg"
          title={t("statusbar.settings")}
          onClick={() => setSettingsOpen(true)}
        >
          <FiSettings size={16} />
        </Button>
      </div>
    </div>
  );
}

const TitleBar = memo(TitleBarImpl);
export default TitleBar;
