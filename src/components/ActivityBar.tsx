import { FiFolder, FiCheckSquare, FiList } from "react-icons/fi";
import { useEditorStore } from "../store/editor";
import { useT } from "../lib/i18n";

/** Thin (40px) vertical strip on the very left, JetBrains-style. Each icon
 *  switches the left tool window between Project (file tree) and Commit
 *  (changes list). Active icon is highlighted with the accent color. */
export default function ActivityBar() {
  const t = useT();
  const leftPanel = useEditorStore((s) => s.leftPanel);
  const setLeftPanel = useEditorStore((s) => s.setLeftPanel);

  return (
    <div
      className="flex flex-col items-center"
      style={{
        width: 40,
        flexShrink: 0,
        background: "var(--bg-soft)",
        borderRight: "1px solid var(--border)",
        paddingTop: 4,
        gap: 2,
      }}
    >
      <ActivityIcon
        active={leftPanel === "files"}
        title={t("activity.project")}
        onClick={() => setLeftPanel("files")}
      >
        <FiFolder size={18} />
      </ActivityIcon>
      <ActivityIcon
        active={leftPanel === "commit"}
        title={t("activity.commit")}
        onClick={() => setLeftPanel("commit")}
      >
        <FiCheckSquare size={18} />
      </ActivityIcon>
      <ActivityIcon
        active={false}
        title={t("activity.log")}
        onClick={() => {
          // Log opens as an editor-area tab (like JetBrains' Log tool window
          // when popped out), since the 3-pane layout needs more horizontal
          // room than the sidebar offers.
          const s = useEditorStore.getState();
          const ws =
            s.focusedWorkspace ??
            s.workspaces[0] ??
            null;
          if (!ws) return;
          s.openLogTab({ workspace: ws });
        }}
      >
        <FiList size={18} />
      </ActivityIcon>
    </div>
  );
}

function ActivityIcon({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 32,
        height: 32,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: active ? "var(--bg-mute)" : "transparent",
        border: "none",
        borderRadius: 4,
        cursor: "pointer",
        color: active ? "var(--accent)" : "var(--text-soft)",
        transition: "background 0.12s, color 0.12s",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--hover-bg)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}
