import { useEffect, useRef, useState } from "react";
import { EditorPaneContext, useEditorStore } from "../store/editor";
import { beginPaneResize } from "../lib/paneResize";
import { useT } from "../lib/i18n";
import EditorPane from "./EditorPane";

export default function EditorGroups({ initialPreviewPct, onPreviewPctChange }: { initialPreviewPct: number; onPreviewPctChange?: (pct: number) => void }) {
  const split = useEditorStore(s => !!s.panes);
  const [leftPct, setLeftPct] = useState(50);
  const stop = useRef<(() => void) | null>(null);
  const t = useT();
  useEffect(() => () => stop.current?.(), []);
  useEffect(() => { stop.current?.(); }, [split]);
  return <div className="editor-groups flex flex-1 min-w-0 min-h-0">
    <div className="flex min-w-0" style={{ flex: split ? `0 0 ${leftPct}%` : "1 1 0" }}>
      <EditorPaneContext.Provider value="left"><EditorPane initialPreviewPct={initialPreviewPct} onPreviewPctChange={onPreviewPctChange} /></EditorPaneContext.Provider>
    </div>
    {split && <>
      <div className="splitter editor-group-divider" role="separator" aria-label={t("split.resize")} aria-orientation="vertical" aria-valuemin={20} aria-valuemax={80} aria-valuenow={Math.round(leftPct)} tabIndex={0}
        onDoubleClick={() => setLeftPct(50)}
        onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home") { e.preventDefault(); setLeftPct(n => e.key === "Home" ? 50 : Math.min(80, Math.max(20, n + (e.key === "ArrowRight" ? 2 : -2)))); } }}
        onPointerDown={e => {
          if (e.button !== 0 || e.isPrimary === false) return;
          const rect = e.currentTarget.parentElement!.getBoundingClientRect();
          stop.current?.();
          stop.current = beginPaneResize(e.currentTarget, e.nativeEvent, event => setLeftPct(Math.min(80, Math.max(20, (event.clientX - rect.left) / rect.width * 100))));
        }} />
      <div className="flex flex-1 min-w-0"><EditorPaneContext.Provider value="right"><EditorPane initialPreviewPct={initialPreviewPct} /></EditorPaneContext.Provider></div>
    </>}
  </div>;
}
