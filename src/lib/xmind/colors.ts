export function colorLuminance(fill: string, opacity = 1, background = "#FFFFFF"): number {
  const rgba = (color: string) => {
    let hex = /^#([\da-f]{3,8})$/i.exec(color)?.[1];
    if (!hex || ![3, 4, 6, 8].includes(hex.length)) return null;
    if (hex.length < 5) hex = Array.from(hex, c => c + c).join("");
    return [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
      .concat(hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1);
  };
  const bg = rgba(background) ?? [1, 1, 1, 1];
  const base = bg.slice(0, 3).map(c => c * bg[3] + 1 - bg[3]);
  const foreground = rgba(fill);
  const alpha = foreground ? foreground[3] * opacity : 0;
  const rgb = base.map((c, i) => (foreground?.[i] ?? c) * alpha + c * (1 - alpha));
  const [r, g, b] = rgb.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function automaticTextColor(fill: string, opacity = 1, background = "#FFFFFF"): string {
  return colorLuminance(fill, opacity, background) > 0.179 ? "#000000" : "#FFFFFF";
}
/** Native smart themes prefer white above 3:1, then their highest-contrast palette entry. */
export function smartTextColor(fill: string, opacity: number, background: string, palette: string[]): string {
  const luminance = colorLuminance(fill, opacity, background);
  const contrast = (color: string) => {
    const candidate = colorLuminance(color);
    return (Math.max(luminance, candidate) + 0.05) / (Math.min(luminance, candidate) + 0.05);
  };
  if (contrast("#FFFFFF") > 3) return "#FFFFFF";
  let best = palette[0] ?? "#000000", ratio = contrast(best);
  for (const color of palette.slice(1)) {
    const next = contrast(color);
    if (next > ratio) { best = color; ratio = next; }
  }
  return ratio > 3 ? best : "#000000";
}
/** Native level styles keep hue/saturation and use 20% HSL lightness. */
export function levelTextColor(fill: string): string {
  const hex = /^#([\da-f]{6})$/i.exec(fill)?.[1];
  if (!hex) return automaticTextColor(fill);
  const rgb = [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const min = Math.min(...rgb), max = Math.max(...rgb), delta = max - min;
  if (!delta) return "#333333";
  const saturation = delta / (1 - Math.abs(max + min - 1));
  const low = 0.2 * (1 - saturation), span = 0.4 * saturation;
  return "#" + rgb.map(value => Math.floor((low + (value - min) / delta * span) * 255 + 1e-8).toString(16).padStart(2,"0")).join("").toUpperCase();
}
