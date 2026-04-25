import { detectLang } from "../lib/lang";

interface Props {
  filePath: string;
  size?: number;
}

function readableTextColor(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.6 ? "#1f2328" : "#ffffff";
}

export default function LangIcon({ filePath, size = 16 }: Props) {
  const { icon, label } = detectLang(filePath);

  if (icon.Logo) {
    const Logo = icon.Logo;
    return (
      <span
        title={label}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
          flexShrink: 0,
        }}
      >
        <Logo size={size} color={icon.color} />
      </span>
    );
  }

  const fontSize = icon.short.length >= 3 ? Math.round(size * 0.42) : Math.round(size * 0.55);
  return (
    <span
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: 3,
        background: icon.color,
        color: readableTextColor(icon.color),
        fontSize,
        fontWeight: 700,
        fontFamily: "JetBrains Mono, SF Mono, Menlo, monospace",
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {icon.short}
    </span>
  );
}
