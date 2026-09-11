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
export function arrowDrawing(
  value: string,
): { path: string; filled: boolean } | undefined {
  const paths: Record<string, [string, boolean]> = {
    triangle: ["M1,1 L11,6 1,11 Z", true],
    spearhead: ["M1,1 L11,6 1,11 4,6 Z", true],
    square: ["M1,1 H11 V11 H1 Z", true],
    diamond: ["M1,6 L6,1 11,6 6,11 Z", true],
    herringbone: ["M5,1 L1,6 5,11 M8,1 L4,6 8,11 M11,1 L7,6 11,11", false],
    doublearrow: ["M1,3 L6,6 1,9 3,6 Z M5,2 L11,6 5,10 7,6 Z", true],
    antitriangle: ["M11,1 L1,6 11,11 Z", true],
    attached: ["M10,1 V11", false],
    hook: ["M2,1 L11,6 H2 Z", true],
  };
  const name = arrowName(value);
  if (name === "none" || name === "dot") return;
  const [path, filled] = paths[name] ?? ["M2,1 L11,6 2,11", false];
  return { path, filled };
}
