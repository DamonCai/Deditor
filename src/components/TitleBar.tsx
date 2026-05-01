import { useActiveTab, isTabDirty } from "../store/editor";
import { useEditorStore } from "../store/editor";
import { useT } from "../lib/i18n";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { FiSettings, FiSearch, FiSun, FiMoon } from "react-icons/fi";

// macOS draws traffic lights inside our overlay-styled title bar; reserve ~80px
// on the left so the controls don't overlap the leftmost toolbar content.
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
    void getCurrentWindow().toggleMaximize();
    return;
  }
  void getCurrentWindow().startDragging();
}

/** IntelliJ-style Main Toolbar. App identity on the left, current file name in
 *  the middle (which also acts as the window drag handle), global actions
 *  (search / settings) on the right.
 *
 *  We don't ship git / run config like IntelliJ does — DEditor isn't an IDE —
 *  so the toolbar stays narrow and uncluttered. */
export default function TitleBar() {
  const t = useT();
  const active = useActiveTab();
  const setSettingsOpen = useEditorStore((s) => s.setSettingsOpen);
  const setGotoAnythingOpen = useEditorStore((s) => s.setGotoAnythingOpen);
  const theme = useEditorStore((s) => s.theme);
  const setTheme = useEditorStore((s) => s.setTheme);
  const name = active?.filePath
    ? active.filePath.split(/[\\/]/).pop()
    : t("common.untitled");
  const dirty = active ? isTabDirty(active) : false;

  return (
    <div
      className="flex items-center select-none"
      onMouseDown={onTitleBarMouseDown}
      style={{
        // 40px matches IntelliJ New UI Main Toolbar; traffic-light center
        // (y=14 + 6 = 20) aligns exactly with content vertical center (40/2).
        // Keep 84px reserved on macOS even in fullscreen — the OS hides the
        // traffic lights then, so the gap looks empty but never causes the
        // overlap we'd get if we tried (and failed) to detect the transition.
        height: 40,
        padding: `0 8px 0 ${IS_MAC ? 84 : 12}px`,
        fontSize: 12,
        background: "var(--bg-soft)",
        borderBottom: "1px solid var(--border)",
        gap: 12,
      }}
    >
      {/* App identity. Mirrors IntelliJ's project-name button — static-styled,
          no popover wired up because we don't model multiple projects. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontWeight: 600,
          color: "var(--text)",
          letterSpacing: "0.02em",
        }}
      >
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 20,
            height: 20,
            borderRadius: 4,
            background: "var(--accent)",
            color: "#fff",
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          D
        </span>
        <span>DEditor</span>
      </div>

      {/* Filename in the middle. */}
      <div
        className="flex items-center justify-center"
        style={{ flex: 1, minWidth: 0, gap: 6, color: "var(--text-soft)" }}
      >
        <span
          style={{
            maxWidth: "60%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </span>
        {dirty && <span style={{ color: "var(--accent)" }}>●</span>}
      </div>

      {/* Right-side action cluster. */}
      <div className="flex items-center" style={{ gap: 2 }}>
        <ToolbarIconButton
          title={t("shortcut.nav.gotoAnything")}
          onClick={() => setGotoAnythingOpen(true)}
        >
          <FiSearch size={15} />
        </ToolbarIconButton>
        <ToolbarIconButton
          title={theme === "dark" ? "Light theme" : "Dark theme"}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <FiSun size={15} /> : <FiMoon size={15} />}
        </ToolbarIconButton>
        <ToolbarIconButton
          title={t("statusbar.settings")}
          onClick={() => setSettingsOpen(true)}
        >
          <FiSettings size={15} />
        </ToolbarIconButton>
      </div>
    </div>
  );
}

function ToolbarIconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="deditor-btn"
      data-variant="ghost"
      style={{
        width: 28,
        height: 28,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
        color: "var(--text-soft)",
        border: "none",
        borderRadius: 4,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
