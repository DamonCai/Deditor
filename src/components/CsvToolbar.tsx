import { useT } from "../lib/i18n";
import PreviewModeSwitch from "./PreviewModeSwitch";

export default function CsvToolbar() {
  const t = useT();
  return <div className="document-toolbar csv-toolbar select-none" role="toolbar" aria-label={t("csv.viewMode")}>
    <span className="csv-toolbar-label">CSV</span>
    <PreviewModeSwitch csv />
  </div>;
}
