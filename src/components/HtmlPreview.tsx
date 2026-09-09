import { useMemo } from "react";
import { useShallow } from "zustand/shallow";
import { useEditorStore } from "../store/editor";
import { buildHtmlPreview } from "../lib/htmlPreview";
import { useT } from "../lib/i18n";
import { logError } from "../lib/logger";

export default function HtmlPreview({ tabId }: { tabId: string }) {
  const t = useT();
  const tab = useEditorStore(useShallow((s) => {
    const tab = s.tabs.find((item) => item.id === tabId);
    return tab ? { content: tab.content, filePath: tab.filePath } : null;
  }));
  const result = useMemo(() => {
    if (!tab?.filePath) return null;
    try {
      return { html: buildHtmlPreview(tab.content, tab.filePath) };
    } catch (err) {
      logError("HTML preview failed", err);
      return { error: true };
    }
  }, [tab?.content, tab?.filePath]);

  if (!result) return null;
  if (result.error) return <div role="alert" className="deditor-notice" data-tone="error">{t("html.previewError")}</div>;
  return (
    <iframe
      title={t("html.previewTitle")}
      srcDoc={result.html}
      sandbox=""
      referrerPolicy="no-referrer"
      style={{ display: "block", width: "100%", height: "100%", border: 0, background: "#fff", colorScheme: "light" }}
    />
  );
}
