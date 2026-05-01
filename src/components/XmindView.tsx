import { useEffect, useRef, useState } from "react";
import { dataUrlToBytes, parseXmind } from "../lib/xmind/parse";
import type { XmindWorkbook } from "../lib/xmind/parse";
import { logError } from "../lib/logger";
import XmindCanvas, { type XmindCanvasHandle } from "./XmindCanvas";
import { Button } from "./ui/Button";

type ViewMode = "read" | "edit";
const VIEW_MODE_KEY = "deditor:xmind:viewMode";

interface Props {
  /** `data:application/vnd.xmind.workbook;base64,...` from the tab content. */
  dataUrl: string;
  filePath: string | null;
  /** Tab id — required for edit mode (we push edits into the tab via setContent). */
  tabId?: string;
}

/** XMind tab: parses the .xmind once, then hands the active sheet over to
 *  XmindCanvas (which uses mind-elixir for both Read and Edit). Read = canvas
 *  with all interactivity off; Edit = full mind-elixir. Visual is identical
 *  in either mode (a deliberate trade — we don't try to mimic XMind's brace
 *  style; we trust the data protocol to keep the file XMind-compatible). */
export default function XmindView({ dataUrl, filePath, tabId }: Props) {
  const [wb, setWb] = useState<XmindWorkbook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [mode, setMode] = useState<ViewMode>(() => {
    try {
      const v = localStorage.getItem(VIEW_MODE_KEY);
      return v === "edit" ? "edit" : "read";
    } catch {
      return "read";
    }
  });
  const canvasRef = useRef<XmindCanvasHandle>(null);
  const applyMode = (m: ViewMode) => {
    setMode(m);
    try { localStorage.setItem(VIEW_MODE_KEY, m); } catch { /* ignore */ }
  };

  useEffect(() => {
    setWb(null);
    setError(null);
    setSheetIdx(0);
    try {
      const parsed = parseXmind(dataUrlToBytes(dataUrl));
      if (parsed.sheets.length === 0) {
        setError("This .xmind has no readable sheets.");
        return;
      }
      setWb(parsed);
    } catch (e) {
      logError("xmind parse failed", e);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [dataUrl]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full w-full p-4" style={{ color: "var(--text-soft)" }}>
        Failed to read XMind file: {error}
      </div>
    );
  }
  if (!wb) {
    return (
      <div className="flex items-center justify-center h-full w-full" style={{ color: "var(--text-soft)" }}>
        Loading…
      </div>
    );
  }

  const idx = Math.min(sheetIdx, wb.sheets.length - 1);
  const sheet = wb.sheets[idx];
  const fileName = filePath?.split(/[\\/]/).pop() ?? "xmind";
  // Edit is supported on v3 only — legacy XML files would need a separate
  // serializer to round-trip safely; we don't ship one.
  const canEdit = !!tabId && wb.version === "v3";
  const isEditing = mode === "edit" && canEdit;

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "var(--bg)" }}>
      <Header
        fileName={fileName}
        version={wb.version}
        sheets={wb.sheets}
        activeIdx={idx}
        onActive={setSheetIdx}
        mode={mode}
        onMode={applyMode}
        canEdit={canEdit}
        canAddDetached={isEditing}
        onAddDetached={() => canvasRef.current?.addDetachedTopic()}
      />
      <XmindCanvas
        // Re-mount on mode flip so mind-elixir picks up the new editable flag,
        // and on sheet switch so the canvas swaps trees cleanly.
        ref={canvasRef}
        key={`${sheet.id}-${mode}`}
        sheet={sheet}
        readonly={!isEditing}
        originalDataUrl={dataUrl}
        tabId={tabId}
      />
    </div>
  );
}

interface HeaderProps {
  fileName: string;
  version: string;
  sheets: { id: string; title: string }[];
  activeIdx: number;
  onActive: (i: number) => void;
  mode: ViewMode;
  onMode: (m: ViewMode) => void;
  /** false → Edit button greyed out (legacy XML files / no tabId). */
  canEdit: boolean;
  /** Show / enable the "+ 自由主题" button (only true while editing). */
  canAddDetached: boolean;
  onAddDetached: () => void;
}

function Header({ fileName, version, sheets, activeIdx, onActive, mode, onMode, canEdit, canAddDetached, onAddDetached }: HeaderProps) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1 text-xs"
      style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-soft)",
        color: "var(--text-soft)",
        flexShrink: 0,
      }}
    >
      <span style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}>
        {fileName}
      </span>
      <span>·</span>
      <span>{version === "v3" ? "XMind v3" : version === "legacy" ? "XMind legacy" : "?"}</span>
      {sheets.length > 1 && (
        <>
          <span>·</span>
          <div className="flex items-center gap-1">
            {sheets.map((s, i) => (
              <Button
                key={s.id}
                size="sm"
                pressed={i === activeIdx}
                onClick={() => onActive(i)}
              >
                {s.title || `Sheet ${i + 1}`}
              </Button>
            ))}
          </div>
        </>
      )}
      <div className="flex-1" />
      {canAddDetached && (
        <Button
          size="sm"
          onClick={onAddDetached}
          title="添加自由主题（不与主树连线）"
          style={{ marginRight: 8 }}
        >
          + 自由主题
        </Button>
      )}
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          pressed={mode === "read"}
          onClick={() => onMode("read")}
          title="只读视图"
        >
          Read
        </Button>
        <Button
          size="sm"
          pressed={mode === "edit"}
          disabled={!canEdit}
          onClick={() => canEdit && onMode("edit")}
          title={canEdit ? "编辑（Cmd+S 写回 .xmind）" : "此文件不支持编辑（旧版 XML 格式）"}
        >
          Edit
        </Button>
      </div>
    </div>
  );
}
