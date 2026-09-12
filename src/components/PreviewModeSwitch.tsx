import { useEditorStore } from "../store/editor";
import { useT } from "../lib/i18n";
import { SegmentedControl } from "./ui/SegmentedControl";
import { useEffect, useState } from "react";
import { getActiveView, getActiveViewTabId, subscribeActiveEditor } from "../lib/editorBridge";
import { getVisualEditor, subscribeVisualEditor } from "../lib/markdownVisualBridge";

/** Shared Markdown / HTML view selector, retaining the Markdown styling. */
export default function PreviewModeSwitch({ markdown = false }: { markdown?: boolean }) {
  const t = useT();
  const markdownMode = useEditorStore(s => s.markdownMode);
  const activeId = useEditorStore(s => s.activeId);
  const [focusRequest, setFocusRequest] = useState<{ tabId: string | null; mode: "source" | "split" | "visual"; control: Element | null } | null>(null);
  const setMarkdownMode = (mode: "source" | "split" | "visual") => {
    setFocusRequest({ tabId: activeId, mode, control: document.activeElement });
    useEditorStore.setState({ markdownMode: mode });
  };
  useEffect(() => {
    if (!focusRequest) return;
    let done = false;
    const focus = () => {
      if (done) return;
      const current = useEditorStore.getState();
      if (current.activeId !== focusRequest.tabId || current.markdownMode !== focusRequest.mode || document.activeElement !== focusRequest.control) {
        done = true; setFocusRequest(null); return;
      }
      const editor = current.markdownMode === "visual" ? getVisualEditor() : getActiveView();
      const tabId = current.markdownMode === "visual" ? getVisualEditor()?.tabId : getActiveViewTabId();
      if (!editor || tabId !== current.activeId) return;
      done = true; setFocusRequest(null); editor.focus();
    };
    // The selected projection may still be loading. Wait for its bridge, and
    // abandon the request if the user has moved focus or changed documents.
    const stopSource = subscribeActiveEditor(focus), stopVisual = subscribeVisualEditor(focus);
    focus();
    return () => { done = true; stopSource(); stopVisual(); };
  }, [focusRequest, activeId, markdownMode]);
  const showPreview = useEditorStore((s) => s.showPreview);
  const previewMaximized = useEditorStore((s) => s.previewMaximized);
  const viewMode: "edit" | "split" | "preview" = !showPreview
    ? "edit"
    : previewMaximized
      ? "preview"
      : "split";
  const setViewMode = (mode: "edit" | "split" | "preview") => {
    if (mode === "edit") {
      useEditorStore.setState({ showPreview: false, previewMaximized: false });
    } else if (mode === "split") {
      useEditorStore.setState({ showPreview: true, previewMaximized: false });
    } else {
      useEditorStore.setState({ showPreview: true, previewMaximized: true });
    }
  };

  if (markdown) return <SegmentedControl value={markdownMode} onChange={setMarkdownMode} label={t("common.viewMode")} options={[
    { value: "source", label: t("md.viewEdit") },
    { value: "split", label: t("md.viewSplit") },
    { value: "visual", label: t("md.viewVisual") },
  ]} />;

  return (
    <SegmentedControl value={viewMode} onChange={setViewMode} label={t("common.viewMode")}
      options={[
        { value: "edit", label: t("md.viewEdit") },
        { value: "split", label: t("md.viewSplit") },
        { value: "preview", label: t("md.viewPreview") },
      ]} />
  );
}
