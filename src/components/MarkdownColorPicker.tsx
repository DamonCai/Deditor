import { useEffect, useLayoutEffect, useRef, useState, useId } from "react";
import { createPortal } from "react-dom";
import { FiCheck, FiChevronDown } from "react-icons/fi";
import { Button } from "./ui/Button";
import { useT } from "../lib/i18n";
import { captureEditorTarget } from "../lib/editorBridge";

const THEME_COLORS = [
  ["#FFFFFF", "#F2F2F2", "#D9D9D9", "#BFBFBF", "#A6A6A6"],
  ["#222222", "#808080", "#595959", "#404040", "#000000"],
  ["#44546A", "#D6DCE4", "#ADB9CA", "#8497B0", "#333F50"],
  ["#4472C4", "#D9E2F3", "#B4C6E7", "#8EAADB", "#2F5597"],
  ["#5B9BD5", "#DEEAF6", "#BDD7EE", "#9DC3E6", "#2E75B6"],
  ["#70AD47", "#E2EFDA", "#C6E0B4", "#A9D18E", "#548235"],
  ["#FFC000", "#FFF2CC", "#FFE699", "#FFD966", "#BF9000"],
  ["#ED7D31", "#FBE5D6", "#F8CBAD", "#F4B183", "#C55A11"],
  ["#A64D79", "#F2DCE7", "#E4B9D0", "#D795B8", "#843C60"],
  ["#8064A2", "#E4DFEC", "#CCC1DA", "#B2A1C7", "#60497A"],
];
const STANDARD_COLORS = [
  "#C00000",
  "#FF0000",
  "#FFC000",
  "#FFFF00",
  "#92D050",
  "#00B050",
  "#00B0F0",
  "#0070C0",
  "#002060",
  "#7030A0",
];
const palette = Array.from({ length: 5 }, (_, row) =>
  THEME_COLORS.map((column) => column[row]),
).flat();
function normalizeHex(value: string) {
  const hex = value.trim().replace(/^#/, "");
  if (/^[\da-f]{3}$/i.test(hex))
    return (
      "#" +
      [...hex]
        .map((c) => c + c)
        .join("")
        .toUpperCase()
    );
  return /^[\da-f]{6}$/i.test(hex) ? "#" + hex.toUpperCase() : null;
}

export default function MarkdownColorPicker({
  title,
  value,
  disabled,
  highlight,
  onApply,
}: {
  title: string;
  value: string;
  disabled: boolean;
  highlight?: boolean;
  onApply: (color: string) => void;
}) {
  const t = useT();
  const id = useId();
  const [target, setTarget] =
    useState<ReturnType<typeof captureEditorTarget>>(null);
  const [draft, setDraft] = useState(value.toUpperCase());
  const [error, setError] = useState("");
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const valid = normalizeHex(draft);
  const close = (restore = false) => {
    setTarget(null);
    if (restore) triggerRef.current?.focus();
  };
  useEffect(() => {
    if (disabled) setTarget(null);
  }, [disabled]);
  useLayoutEffect(() => {
    if (!target) return;
    const place = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const panel = panelRef.current?.getBoundingClientRect();
      if (!trigger || !panel) return;
      setPosition({
        left: Math.max(
          8,
          Math.min(trigger.left, window.innerWidth - panel.width - 8),
        ),
        top: Math.max(
          8,
          Math.min(trigger.bottom + 6, window.innerHeight - panel.height - 8),
        ),
      });
    };
    place();
    panelRef.current
      ?.querySelector<HTMLElement>('[aria-pressed="true"], .md-color-swatch')
      ?.focus();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [target]);
  useEffect(() => {
    if (!target) return;
    const outside = (event: Event) => {
      if (
        !panelRef.current?.contains(event.target as Node) &&
        !triggerRef.current?.contains(event.target as Node)
      )
        setTarget(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [target]);
  const apply = (color: string) => {
    if (target?.apply(() => onApply(color))) close();
    else setError(t("md.targetChanged"));
  };
  const swatches = (colors: string[], label: string) => (
    <div
      className="md-color-grid"
      role="group"
      aria-label={label}
      onKeyDown={(event) => {
        const buttons = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
        );
        const index = buttons.indexOf(event.target as HTMLButtonElement);
        const step = (
          {
            ArrowRight: 1,
            ArrowLeft: -1,
            ArrowDown: 10,
            ArrowUp: -10,
          } as Record<string, number>
        )[event.key];
        if (index >= 0 && step !== undefined) {
          event.preventDefault();
          buttons[(index + step + buttons.length) % buttons.length].focus();
        }
      }}
    >
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          className="md-color-swatch"
          style={{ backgroundColor: color }}
          aria-label={color}
          title={color}
          aria-pressed={value.toUpperCase() === color}
          onClick={() => apply(color)}
        >
          {value.toUpperCase() === color && <FiCheck />}
        </button>
      ))}
    </div>
  );
  return (
    <>
      <Button
        ref={triggerRef}
        className="md-color-trigger"
        variant="ghost"
        size="icon"
        style={{ width: 36 }}
        title={title}
        aria-label={title}
        disabled={disabled}
        aria-expanded={!!target}
        aria-haspopup="dialog"
        aria-controls={target ? id : undefined}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (target) close(true);
          else {
            setDraft(value.toUpperCase());
            setError("");
            setTarget(captureEditorTarget());
          }
        }}
      >
        <span
          className={
            highlight
              ? "md-color-letter md-color-letter--highlight"
              : "md-color-letter"
          }
        >
          A
          <span
            className="md-color-indicator"
            style={{ backgroundColor: value }}
          />
        </span>
        <FiChevronDown size={10} />
      </Button>
      {target &&
        createPortal(
          <div
            ref={panelRef}
            id={id}
            role="dialog"
            aria-label={title}
            className="md-color-popover"
            style={position}
          >
            <div className="md-color-heading">
              <span>{title}</span>
              <code>{value.toUpperCase()}</code>
            </div>
            <p className="md-color-caption">{t("md.themeColors")}</p>
            {swatches(palette, t("md.themeColors"))}
            <p className="md-color-caption">{t("md.standardColors")}</p>
            {swatches(STANDARD_COLORS, t("md.standardColors"))}
            <form
              className="md-color-custom"
              onSubmit={(event) => {
                event.preventDefault();
                if (valid) apply(valid);
              }}
            >
              <label htmlFor={`${id}-hex`} className="md-color-caption">
                {t("md.customColor")}
              </label>
              <div className="md-color-custom-row">
                <input
                  className="md-native-color"
                  type="color"
                  aria-label={t("md.colorPicker")}
                  title={t("md.colorPicker")}
                  value={valid || value}
                  onInput={(e) => setDraft(e.currentTarget.value.toUpperCase())}
                  onChange={(e) => setDraft(e.target.value.toUpperCase())}
                />
                <input
                  id={`${id}-hex`}
                  className="deditor-input md-hex-input"
                  aria-label={t("md.hexColor")}
                  aria-invalid={!valid}
                  aria-describedby={!valid ? `${id}-error` : undefined}
                  value={draft}
                  maxLength={7}
                  spellCheck={false}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <Button size="sm" type="submit" disabled={!valid}>
                  {t("md.apply")}
                </Button>
              </div>
              {!valid && (
                <p id={`${id}-error`} className="md-color-error">
                  {t("md.invalidHex")}
                </p>
              )}
            </form>
            {error && (
              <div className="deditor-notice" data-tone="error" role="alert">
                {error}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
