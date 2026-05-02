import {
  FiBold,
  FiItalic,
  FiCode,
  FiLink,
  FiList,
  FiMessageSquare,
  FiTable,
  FiMinus,
  FiPlus,
  FiImage,
  FiCheckSquare,
  FiDroplet,
  FiEdit3,
} from "react-icons/fi";
import {
  getActiveView,
  insertCodeBlock,
  insertLink,
  insertText,
  prefixLines,
  wrapSelection,
} from "../lib/editorBridge";
import { useEditorStore } from "../store/editor";
import { useT } from "../lib/i18n";
import { promptInput } from "./PromptDialog";
import { Button } from "./ui/Button";

export default function MarkdownToolbar() {
  const t = useT();
  const editorFontSize = useEditorStore((s) => s.editorFontSize);
  const setEditorFontSize = useEditorStore((s) => s.setEditorFontSize);

  const onLink = async () => {
    const url = await promptInput({
      title: t("md.linkPromptTitle"),
      label: "URL",
      placeholder: "https://example.com",
    });
    if (url) insertLink(url);
  };

  const onImage = async () => {
    // Two-step prompt — keep it simple rather than building a multi-field
    // dialog. The first input becomes the alt text; the second is the URL.
    const alt = await promptInput({
      title: t("md.imagePromptTitle"),
      label: t("md.imageAltLabel"),
      initial: t("md.imageDefaultAlt"),
      placeholder: t("md.imageDefaultAlt"),
    });
    if (alt == null) return;
    const url = await promptInput({
      title: t("md.imagePromptTitle"),
      label: t("md.imageUrlLabel"),
      placeholder: "https://example.com/pic.png",
    });
    if (!url) return;
    insertText(`![${alt}](${url})`);
  };

  const wrapColor = (cssProp: "color" | "background", hex: string) => {
    // Wrap the current selection (or empty caret) with an inline span. The
    // markdown-it config has `html: true` so this round-trips through the
    // preview as styled text.
    wrapSelection(`<span style="${cssProp}:${hex}">`, `</span>`);
    getActiveView()?.focus();
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
      {/* Inline emphasis */}
      <ToolbarButton title={t("md.bold")} onClick={() => wrapSelection("**")}>
        <FiBold size={13} />
      </ToolbarButton>
      <ToolbarButton title={t("md.italic")} onClick={() => wrapSelection("*")}>
        <FiItalic size={13} />
      </ToolbarButton>
      <ToolbarButton
        title={t("md.strikethrough")}
        onClick={() => wrapSelection("~~")}
        label="S̶"
      />
      <ToolbarButton title={t("md.inlineCode")} onClick={() => wrapSelection("`")}>
        <FiCode size={13} />
      </ToolbarButton>
      <Divider />
      {/* Color & highlight — the <input type="color"> sits on top of each
          button. WebKit's native color picker only opens reliably when the
          actual click lands on the input, so we make it transparent rather
          than zero-sized. */}
      <ColorButton
        title={t("md.color")}
        defaultValue="#e53e3e"
        icon={<FiEdit3 size={13} color="#e53e3e" />}
        onPick={(hex) => wrapColor("color", hex)}
      />
      <ColorButton
        title={t("md.highlight")}
        defaultValue="#fff59d"
        icon={<FiDroplet size={13} color="#d69e2e" />}
        onPick={(hex) => wrapColor("background", hex)}
      />
      <Divider />
      {/* Headings */}
      <ToolbarButton
        title={t("md.h1")}
        onClick={() => prefixLines("# ")}
        label="H1"
      />
      <ToolbarButton
        title={t("md.h2")}
        onClick={() => prefixLines("## ")}
        label="H2"
      />
      <ToolbarButton
        title={t("md.h3")}
        onClick={() => prefixLines("### ")}
        label="H3"
      />
      <Divider />
      {/* Lists & blocks */}
      <ToolbarButton title={t("md.ulist")} onClick={() => prefixLines("- ")}>
        <FiList size={13} />
      </ToolbarButton>
      <ToolbarButton
        title={t("md.olist")}
        onClick={() => prefixLines("1. ")}
        label="1."
      />
      <ToolbarButton
        title={t("md.tasklist")}
        onClick={() => prefixLines("- [ ] ")}
      >
        <FiCheckSquare size={13} />
      </ToolbarButton>
      <ToolbarButton title={t("md.quote")} onClick={() => prefixLines("> ")}>
        <FiMessageSquare size={13} />
      </ToolbarButton>
      <ToolbarButton title={t("md.hr")} onClick={() => insertText("\n---\n\n")}>
        <FiMinus size={13} />
      </ToolbarButton>
      <Divider />
      {/* Code & table */}
      <ToolbarButton
        title={t("md.codeblock")}
        onClick={() => insertCodeBlock("")}
        label="{ }"
      />
      <ToolbarButton
        title={t("md.table")}
        onClick={() => insertText(t("md.tableTpl"))}
      >
        <FiTable size={13} />
      </ToolbarButton>
      <Divider />
      {/* Link & image */}
      <ToolbarButton title={t("md.link")} onClick={onLink}>
        <FiLink size={13} />
      </ToolbarButton>
      <ToolbarButton title={t("md.image")} onClick={onImage}>
        <FiImage size={13} />
      </ToolbarButton>
      <div style={{ flex: 1 }} />
      {/* Editor font size */}
      <span style={{ fontSize: 11, color: "var(--text-soft)" }}>
        {t("md.fontSize")}
      </span>
      <ToolbarButton
        title={t("md.smaller")}
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
        title={t("md.bigger")}
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
    <Button
      variant="ghost"
      size={label ? "sm" : "icon"}
      title={title}
      onClick={onClick}
      style={
        label
          ? { height: 24, fontWeight: 600, color: "var(--text)" }
          : { color: "var(--text)" }
      }
    >
      {label ?? children}
    </Button>
  );
}

function ColorButton({
  title,
  defaultValue,
  icon,
  onPick,
}: {
  title: string;
  defaultValue: string;
  icon: React.ReactNode;
  onPick: (hex: string) => void;
}) {
  return (
    <label
      title={title}
      style={{
        height: 24,
        padding: "0 5px",
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 4,
        background: "transparent",
        cursor: "pointer",
        color: "var(--text)",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--hover-bg)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.background = "transparent")
      }
    >
      <input
        type="color"
        defaultValue={defaultValue}
        onInput={(e) => onPick((e.target as HTMLInputElement).value)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          cursor: "pointer",
          // Zero border / padding so the click target matches the visible button.
          border: "none",
          padding: 0,
          margin: 0,
          background: "transparent",
        }}
      />
      {icon}
    </label>
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
