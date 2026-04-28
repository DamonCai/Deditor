import { useActiveTab, isTabDirty } from "../store/editor";
import { useEditorStore } from "../store/editor";
import { useT } from "../lib/i18n";
import { FiSettings } from "react-icons/fi";

export default function TitleBar() {
  const t = useT();
  const active = useActiveTab();
  const setSettingsOpen = useEditorStore((s) => s.setSettingsOpen);
  const name = active?.filePath
    ? active.filePath.split(/[\\/]/).pop()
    : t("common.untitled");
  const dirty = active ? isTabDirty(active) : false;

  return (
    <div
      className="flex items-center select-none"
      style={{
        height: 36,
        padding: "0 12px",
        background: "var(--bg-soft)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <span>{name}</span>
        {dirty && <span style={{ color: "var(--accent)" }}>●</span>}
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-1 text-xs">
        <button
          onClick={() => setSettingsOpen(true)}
          title={t("statusbar.settings")}
          className="px-2 py-1 rounded hover:bg-[color:var(--bg-mute)]"
          style={{ color: "var(--text)", display: "inline-flex", alignItems: "center" }}
        >
          <FiSettings size={14} />
        </button>
      </div>
    </div>
  );
}
