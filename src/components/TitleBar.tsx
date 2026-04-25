import { useActiveTab, isTabDirty } from "../store/editor";
import { useEditorStore } from "../store/editor";
import { isMarkdown } from "../lib/lang";
import { FiSun, FiMoon } from "react-icons/fi";
import {
  openFile,
  saveFile,
  saveFileAs,
  newFile,
  openFolder,
} from "../lib/fileio";
import { exportHtml, exportPdf } from "../lib/export";

export default function TitleBar() {
  const active = useActiveTab();
  const {
    showPreview,
    togglePreview,
    showSidebar,
    toggleSidebar,
    theme,
    setTheme,
  } = useEditorStore();
  const name = active?.filePath
    ? active.filePath.split(/[\\/]/).pop()
    : "未命名";
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
        <ToolBtn onClick={toggleSidebar} active={showSidebar}>
          目录
        </ToolBtn>
        <ToolBtn onClick={openFolder}>打开文件夹</ToolBtn>
        <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 6px" }} />
        <ToolBtn onClick={newFile}>新建</ToolBtn>
        <ToolBtn onClick={openFile}>打开</ToolBtn>
        <ToolBtn onClick={saveFile}>保存</ToolBtn>
        <ToolBtn onClick={saveFileAs}>另存</ToolBtn>
        {isMd && (
          <>
            <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 6px" }} />
            <ToolBtn onClick={togglePreview} active={showPreview}>
              预览
            </ToolBtn>
            <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 6px" }} />
            <ToolBtn onClick={exportHtml}>导出 HTML</ToolBtn>
            <ToolBtn onClick={exportPdf}>导出 PDF</ToolBtn>
          </>
        )}
        <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 6px" }} />
        <button
          onClick={() => setTheme(isDark ? "light" : "dark")}
          title={isDark ? "切到亮色主题" : "切到暗色主题"}
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
