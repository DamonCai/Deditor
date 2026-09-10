import { useEffect, useState, useSyncExternalStore } from "react";
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
  FiRotateCcw,
  FiRotateCw,
  FiGitBranch,
  FiTerminal,
} from "react-icons/fi";
import { undo, redo, undoDepth, redoDepth } from "@codemirror/commands";
import {
  captureEditorTarget,
  getActiveEditorState,
  getActiveView,
  insertBlock,
  prefixLines,
  setSelectionColor,
  subscribeActiveEditor,
  wrapSelection,
} from "../lib/editorBridge";
import { useEditorStore } from "../store/editor";
import { useT } from "../lib/i18n";
import { Button } from "./ui/Button";
import PreviewModeSwitch from "./PreviewModeSwitch";
import MarkdownColorPicker from "./MarkdownColorPicker";
import MarkdownInsertDialog, { type InsertKind } from "./MarkdownInsertDialog";

export default function MarkdownToolbar() {
  const t = useT();
  const state = useSyncExternalStore(
    subscribeActiveEditor,
    getActiveEditorState,
  );
  const activeId = useEditorStore((s) => s.activeId);
  const reading = useEditorStore((s) => s.previewMaximized && s.showPreview);
  const editorFontSize = useEditorStore((s) => s.editorFontSize);
  const setEditorFontSize = useEditorStore((s) => s.setEditorFontSize);
  const disabled = reading || !state;
  const [dialog, setDialog] = useState<{
    kind: InsertKind;
    target: NonNullable<ReturnType<typeof captureEditorTarget>>;
  } | null>(null);
  const [color, setColor] = useState("#e53e3e");
  const [highlight, setHighlight] = useState("#fff59d");
  useEffect(() => {
    setDialog(null);
  }, [activeId, reading]);
  const run = (action: () => void) => {
    if (disabled) return;
    action();
    getActiveView()?.focus();
  };
  const openInsert = (kind: InsertKind) => {
    if (disabled) return;
    const target = captureEditorTarget();
    if (target) setDialog({ kind, target });
  };
  const history = (command: typeof undo) =>
    run(() => {
      const view = getActiveView();
      if (view) command(view);
    });
  const selection = state?.selection.main;
  const selected =
    selection && state ? state.sliceDoc(selection.from, selection.to) : "";
  const heading = state
    ? (state.doc
        .lineAt(state.selection.main.head)
        .text.match(/^ {0,3}(#{1,6})\s/)?.[1].length ?? 0)
    : 0;
  const marked = (marker: string) =>
    !!(
      selection &&
      state &&
      ((selected.startsWith(marker) &&
        selected.endsWith(marker) &&
        selected.length > marker.length * 2) ||
        (state.sliceDoc(
          Math.max(0, selection.from - marker.length),
          selection.from,
        ) === marker &&
          state.sliceDoc(selection.to, selection.to + marker.length) ===
            marker))
    );
  const emphasis = (
    <>
      <Tool
        title={t("md.bold")}
        disabled={disabled}
        pressed={marked("**")}
        onClick={() => run(() => wrapSelection("**"))}
      >
        <FiBold />
      </Tool>
      <Tool
        title={t("md.italic")}
        disabled={disabled}
        pressed={marked("*") && (!marked("**") || marked("***"))}
        onClick={() => run(() => wrapSelection("*"))}
      >
        <FiItalic />
      </Tool>
      <Tool
        title={t("md.strikethrough")}
        disabled={disabled}
        pressed={marked("~~")}
        onClick={() => run(() => wrapSelection("~~"))}
      >
        <span className="md-strike">S</span>
      </Tool>
      <Tool
        title={t("md.inlineCode")}
        disabled={disabled}
        pressed={marked("`")}
        onClick={() => run(() => wrapSelection("`"))}
      >
        <FiCode />
      </Tool>
    </>
  );
  const headingSelect = (
    <select
      className="deditor-input deditor-input--compact md-heading-select"
      aria-label={t("md.heading")}
      disabled={disabled}
      value={heading}
      onChange={(e) =>
        run(() =>
          prefixLines(
            "#".repeat(Number(e.target.value)) +
              (Number(e.target.value) ? " " : ""),
          ),
        )
      }
    >
      <option value={0}>{t("md.paragraph")}</option>
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <option key={n} value={n}>
          H{n}
        </option>
      ))}
    </select>
  );
  const item = (key: string, action: () => void, icon: React.ReactNode) => (
    <Tool title={t(key)} disabled={disabled} onClick={() => run(action)}>
      {icon}
    </Tool>
  );
  return (
    <>
      <div className="md-toolbar-shell md-toolbar-expanded select-none">
        <div className="md-toolbar-row">
          <div className="md-tool-group md-tool-group--leading">
            <Tool
              title={t("md.undo")}
              disabled={disabled || !state || undoDepth(state) === 0}
              onClick={() => history(undo)}
            >
              <FiRotateCcw />
            </Tool>
            <Tool
              title={t("md.redo")}
              disabled={disabled || !state || redoDepth(state) === 0}
              onClick={() => history(redo)}
            >
              <FiRotateCw />
            </Tool>
          </div>
          <div className="md-tool-group md-tool-group--leading">
            {headingSelect}
            {emphasis}
          </div>
          <div className="md-tool-group">
            {item("md.ulist", () => prefixLines("- "), <FiList />)}
            {item(
              "md.olist",
              () => prefixLines("1. "),
              <span className="md-symbol">1.</span>,
            )}
            {item(
              "md.tasklist",
              () => prefixLines("- [ ] "),
              <FiCheckSquare />,
            )}
            {item("md.quote", () => prefixLines("> "), <FiMessageSquare />)}
          </div>
          <div className="md-tool-group md-toolbar-colors">
            <MarkdownColorPicker
              key={`text-${activeId}`}
              title={t("md.color")}
              value={color}
              disabled={disabled}
              onApply={(value) => {
                setColor(value);
                run(() => setSelectionColor("color", value));
              }}
            />
            <MarkdownColorPicker
              key={`highlight-${activeId}`}
              title={t("md.highlight")}
              value={highlight}
              disabled={disabled}
              highlight
              onApply={(value) => {
                setHighlight(value);
                run(() => setSelectionColor("background", value));
              }}
            />
          </div>
          <div className="md-tool-group">
            {item("md.link", () => openInsert("link"), <FiLink />)}
            {item("md.image", () => openInsert("image"), <FiImage />)}
            {item("md.table", () => openInsert("table"), <FiTable />)}
            {item(
              "md.codeblock",
              () => openInsert("codeblock"),
              <FiTerminal />,
            )}
            {item("md.hr", () => insertBlock("---", 3, 0), <FiMinus />)}
          </div>
          <div className="md-tool-group">
            {item(
              "md.inlineMath",
              () => wrapSelection("$"),
              <span className="md-symbol">ƒ</span>,
            )}
            {item(
              "md.blockMath",
              () => {
                const value = selected || "E = mc^2";
                insertBlock(`$$\n${value}\n$$`, 3, value.length);
              },
              <span className="md-symbol">∑</span>,
            )}
            {item(
              "md.mermaid",
              () => {
                const diagram =
                  "```mermaid\nflowchart LR\n  A[Start] --> B[End]\n```";
                insertBlock(diagram, diagram.indexOf("Start"), 5);
              },
              <FiGitBranch />,
            )}
          </div>
          <div
            className="md-tool-group md-font-controls"
            role="group"
            aria-label={t("md.editorFontSize")}
            title={t("md.editorFontSize")}
          >
            <Tool
              title={t("md.smaller")}
              disabled={disabled || editorFontSize <= 10}
              onClick={() => setEditorFontSize(editorFontSize - 1)}
            >
              <FiMinus />
            </Tool>
            <output>{editorFontSize}</output>
            <Tool
              title={t("md.bigger")}
              disabled={disabled || editorFontSize >= 28}
              onClick={() => setEditorFontSize(editorFontSize + 1)}
            >
              <FiPlus />
            </Tool>
          </div>
          <div className="md-toolbar-views">
            <PreviewModeSwitch />
          </div>
        </div>
      </div>
      {dialog && (
        <MarkdownInsertDialog {...dialog} onClose={() => setDialog(null)} />
      )}
    </>
  );
}
function Tool({
  title,
  onClick,
  disabled,
  pressed,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      title={title}
      aria-label={title}
      disabled={disabled}
      pressed={pressed}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="md-tool"
    >
      {children}
    </Button>
  );
}
