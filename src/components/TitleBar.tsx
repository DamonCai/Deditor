import { useActiveTab, isTabDirty } from "../store/editor";
import { useEditorStore } from "../store/editor";
import { isMarkdown } from "../lib/lang";
import { useT } from "../lib/i18n";
import { FiSun, FiMoon, FiSettings } from "react-icons/fi";
import { exportHtml, exportPdf } from "../lib/export";

export default function TitleBar() {
  const t = useT();
  const active = useActiveTab();
  const {
    showPreview,
    togglePreview,
    theme,
    setTheme,
    language,
    setLanguage,
  } = useEditorStore();
  const setSettingsOpen = useEditorStore((s) => s.setSettingsOpen);
  const name = active?.filePath
    ? active.filePath.split(/[\\/]/).pop()
    : t("common.untitled");
  const dirty = active ? isTabDirty(active) : false;
  const isMd = isMarkdown(active?.filePath ?? null);
  const isDark = theme === "dark";

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
        {isMd && (
          <>
            <ToolBtn onClick={togglePreview} active={showPreview}>
              {t("titlebar.preview")}
            </ToolBtn>
            <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 6px" }} />
            <ToolBtn onClick={exportHtml}>{t("titlebar.exportHtml")}</ToolBtn>
            <ToolBtn onClick={exportPdf}>{t("titlebar.exportPdf")}</ToolBtn>
            <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 6px" }} />
          </>
        )}
        <button
          onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
          title={
            language === "zh" ? t("titlebar.toEnglish") : t("titlebar.toChinese")
          }
          className="px-2 py-1 rounded hover:bg-[color:var(--bg-mute)]"
          style={{
            color: "var(--text)",
            fontWeight: 600,
            minWidth: 28,
            textAlign: "center",
          }}
        >
          {language === "zh" ? "EN" : "中"}
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          title={t("statusbar.settings")}
          className="px-2 py-1 rounded hover:bg-[color:var(--bg-mute)]"
          style={{ color: "var(--text)", display: "inline-flex", alignItems: "center" }}
        >
          <FiSettings size={14} />
        </button>
        <button
          onClick={() => setTheme(isDark ? "light" : "dark")}
          title={isDark ? t("titlebar.toLight") : t("titlebar.toDark")}
          className="px-2 py-1 rounded hover:bg-[color:var(--bg-mute)]"
          style={{ color: "var(--text)", display: "inline-flex", alignItems: "center" }}
        >
          {isDark ? <FiSun size={14} /> : <FiMoon size={14} />}
        </button>
      </div>
    </div>
  );
}

function ToolBtn({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-1 rounded hover:bg-[color:var(--bg-mute)]"
      style={{
        color: active ? "var(--accent)" : "var(--text)",
      }}
    >
      {children}
    </button>
  );
}
