import { useEditorStore } from "../store/editor";
import { useT } from "../lib/i18n";
import { SegmentedControl } from "./ui/SegmentedControl";

/** Shared Markdown / HTML view selector, retaining the Markdown styling. */
export default function PreviewModeSwitch() {
  const t = useT();
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

  return (
    <SegmentedControl value={viewMode} onChange={setViewMode} label={t("common.viewMode")}
      options={[
        { value: "edit", label: t("md.viewEdit") },
        { value: "split", label: t("md.viewSplit") },
        { value: "preview", label: t("md.viewPreview") },
      ]} />
  );
}
