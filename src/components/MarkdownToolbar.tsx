import { getVisualEditor, subscribeVisualEditor } from "../lib/markdownVisualBridge";
import { markdownHistory } from "../lib/markdownHistory";
import { markdownSession } from "../lib/markdownSession";
import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from "react";
import {
  FiDownload,
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
  FiTerminal,
  FiChevronDown,
} from "react-icons/fi";
import { undo, redo } from "@codemirror/commands";
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
import MarkdownDiagramPicker from "./MarkdownDiagramPicker";
import MarkdownInsertDialog, { type InsertKind } from "./MarkdownInsertDialog";

const MarkdownExportDialog = lazy(() => import("./MarkdownExportDialog"));

export default function MarkdownToolbar() {
  const t = useT();
  const state = useSyncExternalStore(
    subscribeActiveEditor,
    getActiveEditorState,
  );
  const visual = useSyncExternalStore(subscribeVisualEditor, getVisualEditor);
  const content = useEditorStore(s => s.tabs.find(t => t.id === s.activeId)?.content ?? "");
  const activeId = useEditorStore((s) => s.activeId);
  const reading = useEditorStore((s) => s.markdownMode === "read");
  const session = activeId ? markdownSession(activeId, content) : null;
  const editorFontSize = useEditorStore((s) => s.tabs.find((tab) => tab.id === s.activeId)?.zoomFontSize ?? s.editorFontSize);
  const setEditorZoomFontSize = useEditorStore((s) => s.setEditorZoomFontSize);
  const disabled = reading || (!visual && !state);
  const [dialog, setDialog] = useState<{
    kind: InsertKind;
    target: NonNullable<ReturnType<typeof captureEditorTarget>>;
  } | null>(null);
  const [exportSnapshot, setExportSnapshot] = useState<{ content: string; filePath: string | null; theme: "light" | "dark" } | null>(null);
  const [color, setColor] = useState("#e53e3e");
  const [highlight, setHighlight] = useState("#fff59d");
  useEffect(() => {
    setDialog(null);
  }, [activeId, reading]);
  const run = (action: () => void) => {
    if (disabled) return;
    action();
    if (visual) visual.focus(); else getActiveView()?.focus();
  };
  const openInsert = (kind: InsertKind) => {
    if (disabled) return;
    const target = captureEditorTarget();
    if (target) setDialog({ kind, target });
  };
  const history = (command: typeof undo) =>
    run(() => {
      markdownHistory(command === redo);
    });
  const selection = state?.selection.main;
  const selected = visual?.selected ?? (
    selection && state ? state.sliceDoc(selection.from, selection.to) : "");
  const heading = visual?.heading ?? (state
    ? (state.doc
        .lineAt(state.selection.main.head)
        .text.match(/^ {0,3}(#{1,6})\s/)?.[1].length ?? 0)
    : 0);
  const marked = (marker: string) => visual ? visual.marked(marker) :
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
              disabled={reading || !session?.canUndo}
              onClick={() => history(undo)}
            >
              <FiRotateCcw />
            </Tool>
            <Tool
              title={t("md.redo")}
              disabled={reading || !session?.canRedo}
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
            {item("md.underline", () => wrapSelection("<u>", "</u>"), <span style={{ textDecoration: "underline" }}>U</span>)}
            {item("md.superscript", () => wrapSelection("<sup>", "</sup>"), <span>x<sup>2</sup></span>)}
            {item("md.subscript", () => wrapSelection("<sub>", "</sub>"), <span>x<sub>2</sub></span>)}
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
            {item("md.details", () => {
              const opening = `<details>\n<summary>${t("md.detailsTitle")}</summary>\n\n`;
              const body = selected || t("md.detailsBody");
              insertBlock(`${opening}${body}\n\n</details>`, opening.length, body.length);
            }, <FiChevronDown />)}
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
          </div>
          <div className="md-tool-group">
            <MarkdownDiagramPicker key={`mermaid-${activeId}`} family="mermaid" disabled={disabled} />
            <MarkdownDiagramPicker key={`plantuml-${activeId}`} family="plantuml" disabled={disabled} />
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
              onClick={() => activeId && setEditorZoomFontSize(activeId, editorFontSize - 1)}
            >
              <FiMinus />
            </Tool>
            <output>{editorFontSize}</output>
            <Tool
              title={t("md.bigger")}
              disabled={disabled || editorFontSize >= 28}
              onClick={() => activeId && setEditorZoomFontSize(activeId, editorFontSize + 1)}
            >
              <FiPlus />
            </Tool>
          </div>
          <div className="md-tool-group">
            <Button variant="ghost" size="sm" title={t("export.title")} onClick={() => {
              const current = useEditorStore.getState();
              const tab = current.tabs.find(tab => tab.id === current.activeId);
              if (tab) setExportSnapshot({ content: tab.content, filePath: tab.filePath, theme: current.theme });
            }}><FiDownload style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />{t("export.button")}</Button>
          </div>
          <div className="md-toolbar-views">
            <PreviewModeSwitch markdown />
          </div>
        </div>
      </div>
      {exportSnapshot && <Suspense fallback={null}><MarkdownExportDialog snapshot={exportSnapshot} onClose={() => setExportSnapshot(null)} /></Suspense>}
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
