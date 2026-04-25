import {
  FiBold,
  FiItalic,
  FiCode,
  FiLink,
  FiList,
  FiHash,
  FiMessageSquare,
  FiTable,
  FiMinus,
  FiPlus,
} from "react-icons/fi";
import {
  insertCodeBlock,
  insertLink,
  insertText,
  prefixLines,
  wrapSelection,
} from "../lib/editorBridge";
import { useEditorStore } from "../store/editor";
import { promptInput } from "./PromptDialog";

export default function MarkdownToolbar() {
  const { editorFontSize, setEditorFontSize } = useEditorStore();

  const onLink = async () => {
    const url = await promptInput({
      title: "插入链接",
      label: "URL",
      placeholder: "https://example.com",
    });
    if (url) insertLink(url);
  };

  return (
    <div
      className="flex items-center gap-1 px-2 select-none"
      style={{
        height: 32,
        background: "var(--bg-soft)",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        overflowX: "auto",
      }}
    >
      <ToolbarButton title="加粗 (写入 **...**)" onClick={() => wrapSelection("**")}>
        <FiBold size={13} />
      </ToolbarButton>
      <ToolbarButton title="斜体 (写入 *...*)" onClick={() => wrapSelection("*")}>
        <FiItalic size={13} />
      </ToolbarButton>
      <ToolbarButton title="行内代码 (写入 `...`)" onClick={() => wrapSelection("`")}>
        <FiCode size={13} />
      </ToolbarButton>
      <Divider />
      <ToolbarButton title="一级标题 (#)" onClick={() => prefixLines("# ")}>
        <FiHash size={13} />
      </ToolbarButton>
      <ToolbarButton
        title="二级标题 (##)"
        onClick={() => prefixLines("## ")}
        label="H2"
      />
      <ToolbarButton
        title="三级标题 (###)"
        onClick={() => prefixLines("### ")}
        label="H3"
      />
      <Divider />
      <ToolbarButton title="无序列表 (- )" onClick={() => prefixLines("- ")}>
        <FiList size={13} />
      </ToolbarButton>
      <ToolbarButton title="引用块 (> )" onClick={() => prefixLines("> ")}>
        <FiMessageSquare size={13} />
      </ToolbarButton>
      <ToolbarButton title="代码块 (```)" onClick={() => insertCodeBlock("")} label="{ }" />
      <ToolbarButton
        title="表格"
        onClick={() =>
          insertText(
            "\n| 列 1 | 列 2 |\n| ---- | ---- |\n| 数据 | 数据 |\n",
          )
        }
      >
        <FiTable size={13} />
      </ToolbarButton>
      <ToolbarButton title="链接" onClick={onLink}>
        <FiLink size={13} />
      </ToolbarButton>
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 11, color: "var(--text-soft)" }}>字号</span>
      <ToolbarButton
        title="字号小一点"
        onClick={() => setEditorFontSize(editorFontSize - 1)}
      >
        <FiMinus size={13} />
      </ToolbarButton>
      <span
        style={{
          fontSize: 11,
          minWidth: 22,
          textAlign: "center",
          color: "var(--text)",
        }}
      >
        {editorFontSize}
      </span>
      <ToolbarButton
        title="字号大一点"
        onClick={() => setEditorFontSize(editorFontSize + 1)}
      >
        <FiPlus size={13} />
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  children,
  title,
  onClick,
  label,
}: {
  children?: React.ReactNode;
  title: string;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        height: 24,
        padding: label ? "0 6px" : "0 5px",
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        borderRadius: 4,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        color: "var(--text)",
        fontSize: 11,
        fontWeight: label ? 600 : 400,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-mute)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {label ?? children}
    </button>
  );
}

function Divider() {
  return (
    <div
      style={{
        width: 1,
        height: 14,
        background: "var(--border)",
        margin: "0 4px",
      }}
    />
  );
}
