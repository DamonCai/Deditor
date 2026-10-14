import { useEffect, useState } from "react";
import { FiSettings } from "react-icons/fi";
import { useEditorStore } from "../store/editor";
import { useT } from "../lib/i18n";
import { Button } from "./ui/Button";

export default function EditorFontZoomNotice({ tabId, revision, onDismiss, onReturnFocus }: {
  tabId: string;
  revision: number;
  onDismiss: () => void;
  onReturnFocus: () => void;
}) {
  const t = useT();
  const size = useEditorStore((s) => s.tabs.find((tab) => tab.id === tabId)?.zoomFontSize ?? s.editorFontSize);
  const baseSize = useEditorStore((s) => s.editorFontSize);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (hovered || focused) return;
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [revision, hovered, focused, onDismiss]);

  return (
    <div className="editor-font-zoom-notice"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onDismiss();
        onReturnFocus();
      }}>
      <span role="status" aria-live="polite">{t("editor.fontSizeNotice", { size })}</span>
      <Button variant="ghost" size="sm" className="editor-font-zoom-reset"
        onClick={() => {
          useEditorStore.getState().setEditorZoomFontSize(tabId, null);
          onDismiss();
          onReturnFocus();
        }}>
        {t("editor.fontSizeReset", { size: baseSize })}
      </Button>
      <Button variant="ghost" size="icon" title={t("editor.fontSizeSettings")}
        onClick={() => {
          onDismiss();
          useEditorStore.getState().setSettingsOpen(true);
        }}>
        <FiSettings size={16} aria-hidden="true" />
      </Button>
    </div>
  );
}
