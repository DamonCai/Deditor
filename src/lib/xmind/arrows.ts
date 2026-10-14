/** Fields captured from the native start/end arrow palette. */
export const ARROW_SHAPES = [
  "none",
  "dot",
  "triangle",
  "spearhead",
  "square",
  "diamond",
  "herringbone",
  "doublearrow",
  "antiTriangle",
  "attached",
  "hook",
] as const;
export const RELATIONSHIP_SHAPES = [
  "curved",
  "straight",
  "angled",
  "zigzag",
  "flexible.curved",
  "flexible.angled",
  "flexible.zigzag",
] as const;
export function arrowName(value: string): string {
  return value.replace(/^org\.xmind\.arrowShape\./, "").toLowerCase();
}
/** Geometry in multiples of the connection width; anchor includes native tip spacing. */
export function arrowDrawing(value: string): { path: string; filled: boolean; anchor: number } | undefined {
  const shapes: Record<string, { path: string; filled: boolean; anchor: number }> = {
    triangle: { path: "M0,-2 L4,0 0,2 Z", filled: true, anchor: 4 },
    spearhead: { path: "M-1,-2 L3,0 -1,2 0,0 Z", filled: true, anchor: 3 },
    square: { path: "M0,-2 H4 V2 H0 Z", filled: true, anchor: 4 },
    diamond: { path: "M-1,0 L1.5,-2 4,0 1.5,2 Z", filled: true, anchor: 4 },
    herringbone: { path: "M0,0 H4 M1,-2 L0,0 1,2 M3,-2 L2,0 3,2 M5,-2 L4,0 5,2", filled: false, anchor: 6 },
    doublearrow: { path: "M0,-1.5 L2.5,0 0,1.5 Z M1.5,-2 L4.5,0 1.5,2 Z", filled: true, anchor: 4.5 },
    antitriangle: { path: "M-1,0 L3,-2 3,2 Z", filled: true, anchor: 4 },
    attached: { path: "M0,-2 H1 V2 H0 Z", filled: true, anchor: 2 },
    hook: { path: "M0,-2.5 L6,0.5 0.5,0.5 Z", filled: true, anchor: 6 },
    dot: { path: "M-2,0 A2,2 0 1,0 2,0 A2,2 0 1,0 -2,0 Z", filled: true, anchor: 2 },
  };
  const name = arrowName(value);
  if (name === "none") return;
  return shapes[name] ?? { path: "M0,-2 L4,0 0,2", filled: false, anchor: 4 };
}
