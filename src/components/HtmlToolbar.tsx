import { useT } from "../lib/i18n";
import PreviewModeSwitch from "./PreviewModeSwitch";

export default function HtmlToolbar() {
  const t = useT();
  return (
    <div className="document-toolbar select-none" role="toolbar" aria-label={t("html.viewMode")}>
      <span style={{ flex: 1, fontSize: 12, color: "var(--text-soft)" }}>HTML</span>
      <PreviewModeSwitch />
    </div>
  );
}
