import { shapeName, shapePolygon } from "./shapes";
import type { Relationship, Sheet } from "./document";
import type { Box, SceneNode } from "./scene";

export interface Point { x: number; y: number }
const center = (box: Box): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const numeric = (value: string | undefined, fallback: number) => {
  const n = parseFloat(value ?? "");
  return Number.isFinite(n) ? n : fallback;
};

/** Intersect the ray from the topic centre with its visible outline. */
export function topicAnchor(node: SceneNode, toward: Point): Point {
  const c = center(node), dx = toward.x - c.x, dy = toward.y - c.y;
  if (!dx && !dy) return { x: node.x + node.width, y: c.y };
  const rx = node.width / 2, ry = node.height / 2;
  const shape = shapeName(node.shape);
  const polygon = shapePolygon(shape,node.width,node.height);
  let ratio: number;
  if (polygon) {
    ratio = Infinity;
    for (const [i,a] of polygon.entries()) {
      const b=polygon[(i+1)%polygon.length], ex=b[0]-a[0], ey=b[1]-a[1];
      const ax=a[0]-rx, ay=a[1]-ry, determinant=dx*ey-dy*ex;
      if (Math.abs(determinant)<1e-10) continue;
      const t=(ax*ey-ay*ex)/determinant, u=(ax*dy-ay*dx)/determinant;
      if(t>=0 && u>=0 && u<=1) ratio=Math.min(ratio,t);
    }
    if(!Number.isFinite(ratio)) ratio=1/Math.max(Math.abs(dx)/rx,Math.abs(dy)/ry);
  } else {
    ratio = /ellipse|oval|^circle/.test(shape) ? 1 / Math.hypot(dx / rx, dy / ry)
      : 1 / Math.max(Math.abs(dx) / rx, Math.abs(dy) / ry);
    if (shape === "pill" || shape.includes("round") || shape === "ellipticrectangle") {
      const radius = Math.min(rx, ry, shape === "pill" ? ry : 8);
      const inside = (t: number) => {
        const x = Math.abs(dx * t), y = Math.abs(dy * t);
        if (shape === "ellipticrectangle")
          return y <= ry - 0.8 * node.height * (x / node.width) ** 2;
        return Math.hypot(Math.max(0, x - rx + radius), Math.max(0, y - ry + radius)) <= radius;
      };
      // These outlines are convex. Bisect the centre-to-box ray to find the
      // actual curved edge instead of leaving an arrow in an empty corner.
      let lo = 0, hi = ratio;
      for (let i = 0; i < 48; i++) {
        const mid = (lo + hi) / 2;
        if (inside(mid)) lo = mid; else hi = mid;
      }
      ratio = lo;
    }
  }
  return { x: c.x + dx * ratio, y: c.y + dy * ratio };
}

export function relationshipGeometry(sheet: Sheet, relation: Relationship, a: SceneNode, b: SceneNode) {
  const ca = center(a), cb = center(b);
  const defined = (p?: Record<string, string>) => Object.fromEntries(
    Object.entries(p ?? {}).filter(([, value]) => value !== "inherited"),
  );
  const properties = { ...defined(sheet.theme?.relationship?.properties), ...defined(relation.style?.properties) };
  const shape = (properties["shape-class"] ?? "curve").toLowerCase();
  const controls = relation.controlPoints as Record<string, { x?: number; y?: number; amount?: number; angle?: number }> | undefined;
  // Current XMind's Cartesian control vectors are relative to each topic's
  // centre, confirmed with the generated native control-point probe.
  const distance = Math.hypot(cb.x - ca.x, cb.y - ca.y);
  const reach = Math.max(60, distance * 0.8);
  const horizontal = Math.abs(cb.x - ca.x) >= Math.abs(cb.y - ca.y);
  const defaultVector = horizontal ? { x: 0, y: -reach } : { x: reach, y: 0 };
  const control = (index: number, origin: Point): Point => {
    const point = controls?.[index];
    return finite(point?.x) && finite(point?.y)
      ? { x: origin.x + point.x, y: origin.y + point.y }
      : { x: origin.x + defaultVector.x, y: origin.y + defaultVector.y };
  };
  const c1 = control(0, ca), c2 = control(1, cb);
  const straight = shape.includes("straight"), angled = /angle|elbow/.test(shape);
  const start = topicAnchor(a, straight ? cb : c1), end = topicAnchor(b, straight ? ca : c2);
  const label = straight ? { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
    : angled ? { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 }
      : { x: (start.x + 3 * c1.x + 3 * c2.x + end.x) / 8,
        y: (start.y + 3 * c1.y + 3 * c2.y + end.y) / 8 };
  const path = straight ? `M${start.x},${start.y} L${end.x},${end.y}`
    : angled ? `M${start.x},${start.y} L${c1.x},${c1.y} L${c2.x},${c2.y} L${end.x},${end.y}`
      : `M${start.x},${start.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${end.x},${end.y}`;
  const pattern = properties["line-pattern"] ?? "dash";
  const dash = pattern === "solid" ? undefined : pattern === "dot" ? "1 4"
    : pattern === "dash-dot" ? "6 3 1 3" : "6 4";
  return { start, end, c1, c2, label, path, dash, properties, straight,
    color: properties["line-color"] ?? "#348C83",
    width: Math.max(0.5, numeric(properties["line-width"], 1.5)),
    fontSize: Math.max(9, numeric(properties["fo:font-size"], 12)),
    beginArrow: properties["arrow-begin-class"] ?? "none",
    endArrow: properties["arrow-end-class"] ?? "org.xmind.arrowShape.herringbone",
    unsupportedPolar: Object.values(controls ?? {}).some((p) => !finite(p.x) && finite(p.amount)),
  };
}
