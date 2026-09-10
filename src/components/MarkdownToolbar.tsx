import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
  FiChevronDown,
} from "react-icons/fi";
import { undo, redo, undoDepth, redoDepth } from "@codemirror/commands";
import {
  captureEditorTarget,
  getActiveEditorState,
  getActiveView,
  insertBlock,
  prefixLines,
  subscribeActiveEditor,
  wrapSelection,
} from "../lib/editorBridge";
import { useEditorStore } from "../store/editor";
import { useT } from "../lib/i18n";
import { Button } from "./ui/Button";
import PreviewModeSwitch from "./PreviewModeSwitch";
import MarkdownInsertDialog, { type InsertKind } from "./MarkdownInsertDialog";

type Menu = "format" | "insert" | "more";
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
  const [menu, setMenu] = useState<Menu | null>(null);
  const [dialog, setDialog] = useState<{
    kind: InsertKind;
    target: NonNullable<ReturnType<typeof captureEditorTarget>>;
  } | null>(null);
  const [color, setColor] = useState("#e53e3e");
  const [highlight, setHighlight] = useState("#fff59d");
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const closeMenu = (restore = false) => {
    setMenu(null);
    if (restore) openerRef.current?.focus();
  };
  useEffect(() => {
    setMenu(null);
    setDialog(null);
  }, [activeId, reading]);
  useEffect(() => {
    if (!menu) return;
    const onOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenu(null);
        openerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onKey);
    menuRef.current
      ?.querySelector<HTMLElement>("button:not(:disabled), select, input")
      ?.focus();
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);
  const run = (action: () => void) => {
    if (disabled) return;
    closeMenu();
    action();
    getActiveView()?.focus();
  };
  const openInsert = (kind: InsertKind) => {
    const target = captureEditorTarget();
    if (target) {
      closeMenu();
      setDialog({ kind, target });
    }
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
  const item = (key: string, action: () => void, icon?: React.ReactNode) => (
    <button
      type="button"
      className="md-menu-item"
      aria-label={t(key)}
      onClick={() => run(action)}
    >
      {icon}
      <span>{t(key)}</span>
    </button>
  );
  return (
    <>
      <div
        ref={rootRef}
        className="md-toolbar-shell select-none"
        style={{ position: "relative", containerType: "inline-size" }}
      >
        <div className="md-toolbar-row">
          <div className="md-toolbar-history">
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
            <Divider />
          </div>
          <div className="md-toolbar-heading">{headingSelect}</div>
          <div className="md-toolbar-inline">
            {emphasis}
            <Divider />
          </div>
          {(["format", "insert", "more"] as const).map((name) => (
            <Button
              key={name}
              variant="ghost"
              size="sm"
              disabled={disabled}
              className="md-menu-trigger"
              aria-expanded={menu === name}
              aria-controls={`md-menu-${name}`}
              onClick={(e) => {
                openerRef.current = e.currentTarget;
                setMenu(menu === name ? null : name);
              }}
            >
              {t(`md.${name}`)}
              <FiChevronDown size={12} />
            </Button>
          ))}
          <div className="md-toolbar-spacer" />
          <PreviewModeSwitch />
        </div>
        {menu && !disabled && (
          <div
            ref={menuRef}
            id={`md-menu-${menu}`}
            className={`md-toolbar-popover md-toolbar-popover--${menu}`}
            role="group"
            aria-label={t(`md.${menu}`)}
            onBlur={(e) => {
              if (
                e.relatedTarget &&
                !rootRef.current?.contains(e.relatedTarget)
              )
                setMenu(null);
            }}
          >
            {menu === "format" && (
              <>
                <div className="md-menu-section">
                  {headingSelect}
                  {emphasis}
                </div>
                {item("md.ulist", () => prefixLines("- "), <FiList />)}
                {item("md.olist", () => prefixLines("1. "), <span>1.</span>)}
                {item(
                  "md.tasklist",
                  () => prefixLines("- [ ] "),
                  <FiCheckSquare />,
                )}
                {item("md.quote", () => prefixLines("> "), <FiMessageSquare />)}
                <div className="md-menu-colors">
                  <label>
                    {t("md.color")}
                    <input
                      type="color"
                      aria-label={t("md.color")}
                      value={color}
                      onInput={(e) => setColor(e.currentTarget.value)}
                      onChange={(e) => setColor(e.target.value)}
                    />
                  </label>
                  <Button
                    size="sm"
                    onClick={() =>
                      run(() =>
                        wrapSelection(
                          `<span style="color:${color}">`,
                          "</span>",
                        ),
                      )
                    }
                  >
                    {t("md.apply")}
                  </Button>
                  <label>
                    {t("md.highlight")}
                    <input
                      type="color"
                      aria-label={t("md.highlight")}
                      value={highlight}
                      onInput={(e) => setHighlight(e.currentTarget.value)}
                      onChange={(e) => setHighlight(e.target.value)}
                    />
                  </label>
                  <Button
                    size="sm"
                    onClick={() =>
                      run(() =>
                        wrapSelection(
                          `<span style="background:${highlight}">`,
                          "</span>",
                        ),
                      )
                    }
                  >
                    {t("md.apply")}
                  </Button>
                </div>
              </>
            )}
            {menu === "insert" && (
              <>
                {item("md.link", () => openInsert("link"), <FiLink />)}
                {item("md.image", () => openInsert("image"), <FiImage />)}
                {item("md.table", () => openInsert("table"), <FiTable />)}
                {item(
                  "md.codeblock",
                  () => openInsert("codeblock"),
                  <FiCode />,
                )}
                {item("md.hr", () => insertBlock("---", 3, 0), <FiMinus />)}
                <div className="md-menu-separator" />
                {item(
                  "md.inlineMath",
                  () => wrapSelection("$"),
                  <span>ƒ</span>,
                )}
                {item(
                  "md.blockMath",
                  () => {
                    const value = selected || "E = mc^2";
                    insertBlock(`$$\n${value}\n$$`, 3, value.length);
                  },
                  <span>∑</span>,
                )}
                {item(
                  "md.mermaid",
                  () => {
                    const diagram =
                      "```mermaid\nflowchart LR\n  A[Start] --> B[End]\n```";
                    insertBlock(diagram, diagram.indexOf("Start"), 5);
                  },
                  <span>◇</span>,
                )}
              </>
            )}
            {menu === "more" && (
              <>
                <div className="md-menu-section">
                  <Button
                    size="sm"
                    disabled={!state || undoDepth(state) === 0}
                    onClick={() => history(undo)}
                  >
                    {t("md.undo")}
                  </Button>
                  <Button
                    size="sm"
                    disabled={!state || redoDepth(state) === 0}
                    onClick={() => history(redo)}
                  >
                    {t("md.redo")}
                  </Button>
                </div>
                <div className="md-menu-section md-font-controls">
                  <span>{t("md.editorFontSize")}</span>
                  <Tool
                    title={t("md.smaller")}
                    disabled={editorFontSize <= 10}
                    onClick={() => setEditorFontSize(editorFontSize - 1)}
                  >
                    <FiMinus />
                  </Tool>
                  <output>{editorFontSize}</output>
                  <Tool
                    title={t("md.bigger")}
                    disabled={editorFontSize >= 28}
                    onClick={() => setEditorFontSize(editorFontSize + 1)}
                  >
                    <FiPlus />
                  </Tool>
                </div>
              </>
            )}
          </div>
        )}
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
function Divider() {
  return <span className="md-toolbar-divider" aria-hidden="true" />;
}
