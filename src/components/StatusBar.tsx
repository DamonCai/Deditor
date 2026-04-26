import { useActiveTab, isTabDirty, useEditorStore } from "../store/editor";
import { detectLang } from "../lib/lang";
import { useT } from "../lib/i18n";
import LangIcon from "./LangIcon";

export default function StatusBar() {
  const t = useT();
  const active = useActiveTab();
  const { theme, setTheme } = useEditorStore();
  const filePath = active?.filePath ?? null;
  const content = active?.content ?? "";
  const dirty = active ? isTabDirty(active) : false;
  const lines = content.split("\n").length;
  const chars = content.length;
  const lang = detectLang(filePath);

  return (
    <div
      className="flex items-center justify-between text-xs select-none"
      style={{
        height: 24,
        padding: "0 12px",
        background: "var(--bg-soft)",
        borderTop: "1px solid var(--border)",
        color: "var(--text-soft)",
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {filePath && <LangIcon filePath={filePath} size={14} />}
        <span className="truncate">{filePath ?? t("statusbar.untitled")}</span>
        {dirty && <span style={{ color: "var(--accent)" }}>●</span>}
      </div>
      <div className="flex items-center gap-4 flex-shrink-0">
        <span>{lang.label}</span>
        <span>
          {lines} {t("statusbar.lines")} · {chars} {t("statusbar.chars")}
        </span>
        <button
          className="hover:text-[color:var(--text)]"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? t("statusbar.light") : t("statusbar.dark")}
        </button>
      </div>
    </div>
  );
}
