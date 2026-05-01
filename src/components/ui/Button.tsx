import type { ButtonHTMLAttributes, CSSProperties } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "style"> {
  variant?: Variant;
  /** Compact variant — used in toolbar / dialog footer rows. */
  size?: "sm" | "md";
  /** Visually-active state for two-state toggles (Aa, ▸ etc). */
  pressed?: boolean;
  style?: CSSProperties;
}

/** JetBrains-style button.
 *
 *  - primary:   solid accent fill, white text. Used for the "main" action.
 *  - secondary: 1px border, transparent fill, accent text on hover.
 *  - ghost:     no border, no fill, hover bg overlay. Used for icon buttons
 *               in toolbars and tab close (×).
 *  - danger:    same as primary but accent → red. Destructive confirms.
 *
 *  Hover: --hover-bg overlay; Active: same overlay darkened. Disabled drops
 *  cursor + opacity but stays styled so layout is consistent. */
export function Button({
  variant = "secondary",
  size = "md",
  pressed,
  style,
  disabled,
  children,
  ...rest
}: Props) {
  const padding = size === "sm" ? "3px 10px" : "5px 12px";
  const fontSize = size === "sm" ? 11 : 12;

  let base: CSSProperties;
  switch (variant) {
    case "primary":
      base = {
        background: "var(--accent)",
        color: "#ffffff",
        border: "1px solid var(--accent)",
      };
      break;
    case "danger":
      base = {
        background: "#e55353",
        color: "#ffffff",
        border: "1px solid #e55353",
      };
      break;
    case "ghost":
      base = {
        background: pressed ? "var(--bg-mute)" : "transparent",
        color: "var(--text-soft)",
        border: "1px solid transparent",
      };
      break;
    case "secondary":
    default:
      base = {
        background: pressed ? "var(--bg-mute)" : "transparent",
        color: pressed ? "var(--text)" : "var(--text-soft)",
        border: "1px solid var(--border)",
      };
  }

  return (
    <button
      {...rest}
      disabled={disabled}
      data-variant={variant}
      data-pressed={pressed ? "true" : undefined}
      className={[rest.className ?? "", "deditor-btn"].join(" ").trim()}
      style={{
        ...base,
        padding,
        fontSize,
        borderRadius: 4,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background 120ms ease, color 120ms ease, border-color 120ms ease",
        whiteSpace: "nowrap",
        ...style,
      }}
    />
  );
}
