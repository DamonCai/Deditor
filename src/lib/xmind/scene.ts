import { topicIndicators, type TopicIndicator } from "./indicators";
import {
  type Topic,
  type Sheet,
  type Properties,
  type Group,
} from "./document";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface SceneNode extends Box {
  topic: Topic;
  parent?: string;
  depth: number;
  lines: string[];
  content: Box;
  imageHeight: number;
  labelLines: string[];
  indicators: TopicIndicator[];
  indicatorColumns: number;
  labelY: number;
  indicatorY: number;
  fontSize: number;
  fill: string;
  color: string;
  stroke: string;
  lineColor: string;
  shape: string;
  properties: Properties;
  branch: number;
  detached: boolean;
}
export interface Edge {
  from: string;
  to: string;
  direction: Direction;
  brace: boolean;
  points?: { x: number; y: number }[];
  trunk?: { x: number; y: number }[];
}
export interface SceneGroup extends Box {
  id: string;
  title: string;
  summary: boolean;
  side?: "left" | "right" | "down" | "up";
  properties: Properties;
}
export interface Scene {
  nodes: SceneNode[];
  edges: Edge[];
  groups: SceneGroup[];
  bounds: Box;
  warnings: string[];
  background: string;
}
export type Direction =
  | "right"
  | "left"
  | "down"
  | "up"
  | "side"
  | "timeline"
  | "fishbone";
export const STRUCTURES = [
  ["org.xmind.ui.map.unbalanced", "map"],
  ["org.xmind.ui.logic.right", "right"],
  ["org.xmind.ui.logic.left", "left"],
  ["org.xmind.ui.org-chart.down", "down"],
  ["org.xmind.ui.org-chart.up", "up"],
  ["org.xmind.ui.brace.right", "brace"],
  ["org.xmind.ui.timeline.horizontal", "timeline"],
  ["org.xmind.ui.fishbone.leftHeaded", "fishbone"],
] as const;
export function directionOf(sc?: string): Direction {
  const s = (sc ?? "org.xmind.ui.map.unbalanced").toLowerCase();
  if (s.includes("fishbone")) return "fishbone";
  if (s.includes("timeline")) return "timeline";
  if (/org-chart[.-]down|tree[.-]down/.test(s)) return "down";
  if (/org-chart[.-]up|tree[.-]up/.test(s)) return "up";
  if (s.includes(".left")) return "left";
  if (s.includes(".right")) return "right";
  return "side";
}
const number = (s: string | undefined, fallback: number) => {
  const n = parseFloat(s ?? "");
  return Number.isFinite(n) ? n : fallback;
};
const defined = (p?: Properties): Properties =>
  Object.fromEntries(
    Object.entries(p ?? {}).filter(([, v]) => v !== "inherited"),
  );
const palette = [
  "#4b89c8",
  "#53a58a",
  "#dd9860",
  "#a780b8",
  "#cd728a",
  "#70a6b4",
];
export function styleFor(
  sheet: Sheet,
  topic: Topic,
  depth: number,
  branch: number,
  kind?: "floatingTopic" | "calloutTopic" | "summaryTopic",
) {
  const theme = sheet.theme ?? {};
  const colors =
    (
      theme.map?.properties?.["multi-line-colors"] ??
      theme.map?.properties?.["color-list"]
    )
      ?.split(/\s+/)
      .filter(Boolean) ??
    (sheet.theme
      ? [theme.centralTopic?.properties?.["line-color"] ?? "#64748b"]
      : palette);
  const branchColor = colors[branch % colors.length] ?? palette[0];
  const p: Properties = {
    "fo:font-weight": depth < 2 ? "600" : "400",
    ...defined(
      theme[
        kind ??
          (depth === 0
            ? "centralTopic"
            : depth === 1
              ? "mainTopic"
              : "subTopic")
      ]?.properties,
    ),
    ...defined(topic.style?.properties),
  };
  return {
    properties: p,
    fontSize: Math.max(
      9,
      Math.min(
        64,
        number(p["fo:font-size"], depth === 0 ? 24 : depth === 1 ? 17 : 14),
      ),
    ),
    fill:
      p["svg:fill"] ??
      (depth === 0
        ? "#354d69"
        : sheet.theme
          ? "#eeeeee"
          : depth === 1
            ? "#f4f8fc"
            : "#ffffff"),
    color: p["fo:color"] ?? (depth === 0 ? "#ffffff" : "#283b4c"),
    stroke: p["border-line-color"] ?? (depth === 0 ? "#354d69" : branchColor),
    lineColor: p["line-color"] ?? branchColor,
    shape: p["shape-class"] ?? (depth < 2 ? "roundedRect" : "underline"),
  };
}
export type Measure = (
  text: string,
  size: number,
  properties: Properties,
) => number;
const estimate: Measure = (text, size) =>
  Array.from(text).reduce(
    (sum, c) => sum + (c.charCodeAt(0) > 255 ? 1 : 0.56) * size,
    0,
  );
function wrap(
  text: string,
  width: number,
  size: number,
  p: Properties,
  measure: Measure,
): string[] {
  const lines: string[] = [];
  for (const line of text.split("\n")) {
    let current = "";
    // Segment whitespace/CJK explicitly; long unbroken words still wrap.
    for (const char of Array.from(line)) {
      if (current && measure(current + char, size, p) > width) {
        lines.push(current);
        current = char;
      } else current += char;
    }
    lines.push(current);
  }
  return lines.length ? lines : [""];
}
export function boundsOf(nodes: Box[]): Box {
  if (!nodes.length) return { x: 0, y: 0, width: 1, height: 1 };
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const n of nodes) {
    x = Math.min(x, n.x);
    y = Math.min(y, n.y);
    right = Math.max(right, n.x + n.width);
    bottom = Math.max(bottom, n.y + n.height);
  }
  return { x, y, width: right - x, height: bottom - y };
}
interface Fragment {
  nodes: SceneNode[];
  edges: Edge[];
  bounds: Box;
}
function shift(fragment: Fragment, x: number, y: number) {
  for (const n of fragment.nodes) {
    n.x += x;
    n.y += y;
  }
  for (const edge of fragment.edges)
    for (const point of [...(edge.points ?? []), ...(edge.trunk ?? [])]) { point.x += x; point.y += y; }
  fragment.bounds = {
    ...fragment.bounds,
    x: fragment.bounds.x + x,
    y: fragment.bounds.y + y,
  };
}
export function buildScene(
  sheet: Sheet,
  folded: Set<string> = new Set(),
  measure: Measure = estimate,
): Scene {
  const warnings = new Set<string>();
  function layout(
    topic: Topic,
    depth: number,
    branch: number,
    inherited: Direction,
    parent?: string,
    detached = false,
    kind?: "floatingTopic" | "calloutTopic" | "summaryTopic",
  ): Fragment {
    const style = styleFor(sheet, topic, depth, branch, kind),
      p = style.properties;
    const widthHint = number(
      p["fo:max-width"] ?? p["fo:width"],
      depth === 0 ? 260 : 210,
    );
    const lines = wrap(
      topic.title,
      Math.max(60, widthHint),
      style.fontSize,
      p,
      measure,
    );
    const imageWidth = Math.min(
      260,
      topic.image?.width ?? (topic.image ? 120 : 0),
    );
    const imageHeight = topic.image
      ? Math.min(180, topic.image.height ?? 80)
      : 0;
    // Measure every visible row with the same font used by the SVG renderer.
    const auxiliary = { ...p, "fo:font-weight": "400", "fo:font-style": "normal" };
    const labelLines = topic.labels?.length
      ? wrap(topic.labels.join(" · "), Math.max(60, widthHint), 11, auxiliary, measure) : [];
    const indicators = topicIndicators(topic);
    const indicatorColumns = Math.max(1, Math.min(indicators.length,
      Math.floor((Math.max(60, widthHint) + 4) / 20)));
    const indicatorRows = Math.ceil(indicators.length / indicatorColumns);
    const contentWidth = Math.max(24, imageWidth,
      ...lines.map(s => measure(s, style.fontSize, p)),
      ...labelLines.map(s => measure(s, 11, auxiliary)),
      indicators.length ? indicatorColumns * 20 - 4 : 0);
    const titleHeight = lines.length * style.fontSize * 1.4;
    const pictureHeight = imageHeight ? imageHeight + 8 : 0;
    const contentHeight = pictureHeight + titleHeight +
      (labelLines.length ? 6 + labelLines.length * 16 : 0) +
      (indicatorRows ? 4 + indicatorRows * 20 : 0);
    const paddedWidth = Math.max(depth === 0 ? 100 : 50,
      contentWidth + (depth === 0 ? 58 : depth === 1 ? 48 : 28));
    const paddedHeight = contentHeight + (depth === 0 ? 28 : 18);
    const shape = style.shape.toLowerCase();
    // Inscribe the padded content rectangle in curved / tapered shapes.
    const factor = shape.includes("diamond") ? 2 : /ellipse|oval/.test(shape) ? Math.SQRT2 : 1;
    const width = /pill/.test(shape) ? paddedWidth + paddedHeight : paddedWidth * factor;
    const height = paddedHeight * factor;
    const content = { x: (width - contentWidth) / 2, y: (height - contentHeight) / 2,
      width: contentWidth, height: contentHeight };
    const labelY = content.y + pictureHeight + titleHeight + 6;
    const indicatorY = content.y + pictureHeight + titleHeight +
      (labelLines.length ? 6 + labelLines.length * 16 : 0) + 4;
    const node: SceneNode = {
      topic,
      parent,
      depth,
      branch,
      detached,
      lines,
      content, imageHeight, labelLines, indicators, indicatorColumns, labelY, indicatorY,
      ...style,
      x: -width / 2,
      y: -height / 2,
      width,
      height,
    };
    const fragment: Fragment = { nodes: [node], edges: [], bounds: node };
    const children = folded.has(topic.id)
      ? []
      : (topic.children?.attached ?? []);
    let direction = topic.structureClass
      ? directionOf(topic.structureClass)
      : inherited;
    if (depth > 0 && direction === "side")
      direction = inherited === "left" ? "left" : "right";
    const sc = topic.structureClass ?? "";
    if (
      sc &&
      (!/map|logic|org-chart|tree|brace|timeline|fishbone/.test(sc) ||
        /timeline/.test(sc))
    )
      warnings.add(sc);
    const brace = sc.includes("brace");
    const add = (f: Fragment, d: Direction) => {
      fragment.nodes.push(...f.nodes);
      fragment.edges.push(
        { from: topic.id, to: f.nodes[0].topic.id, direction: d, brace },
        ...f.edges,
      );
    };
    const arrange = (topics: Topic[], d: Direction, offset = 0) => {
      const vertical = d === "down" || d === "up";
      const parts = topics.map((t, i) =>
        layout(t, depth + 1, depth === 0 ? offset + i : branch, d, topic.id),
      );
      const gap = vertical ? 36 : depth === 0 ? 35 : 18;
      const length =
        parts.reduce(
          (sum, f) => sum + (vertical ? f.bounds.width : f.bounds.height),
          0,
        ) +
        gap * Math.max(0, parts.length - 1);
      let cursor = -length / 2;
      for (const part of parts) {
        const b = part.bounds;
        if (vertical) {
          shift(
            part,
            cursor - b.x,
            d === "down"
              ? height / 2 + 64 - b.y
              : -height / 2 - 64 - b.y - b.height,
          );
          cursor += b.width + gap;
        } else {
          shift(
            part,
            d === "left"
              ? -width / 2 -
                  (brace ? 64 : depth === 0 ? 51 : 44) -
                  b.x -
                  b.width
              : width / 2 + (brace ? 64 : depth === 0 ? 51 : 44) - b.x,
            cursor - b.y,
          );
          cursor += b.height + gap;
        }
        add(part, d);
      }
    };
    if (direction === "side") {
      const extensions = topic.extensions as
        | {
            provider?: string;
            content?: { name?: string; content?: string }[];
          }[]
        | undefined;
      const explicit = extensions
        ?.find((e) => e.provider === "org.xmind.ui.map.unbalanced")
        ?.content?.find((c) => c.name === "right-number")?.content;
      const parsed = explicit === undefined ? NaN : Number(explicit);
      const split = Number.isFinite(parsed)
        ? Math.max(0, Math.min(children.length, Math.floor(parsed)))
        : Math.ceil(children.length / 2);
      arrange(children.slice(0, split), "right");
      arrange(children.slice(split).reverse(), "left", split);
    } else if (direction === "fishbone") {
      // Each cause is a diagonal rib. Its children join successive points on
      // that rib horizontally, ordered from the tip towards the spine.
      let cursor = width / 2 + 80;
      const ribs: { part: Fragment; base: number; tip: { x: number; y: number } }[] = [];
      for (let i = 0; i < children.length; i += 2) {
        let pairRight = cursor;
        for (let j = i; j < Math.min(i + 2, children.length); j++) {
          const child = children[j], sign = j % 2 === 0 ? -1 : 1;
          const branchIndex = depth === 0 ? j : branch;
          const bare = { ...child, children: { ...child.children, attached: [] } };
          const part = layout(bare, depth + 1, branchIndex, "right", topic.id);
          const cause = part.nodes[0];
          cause.topic = child;
          const leaves = (folded.has(child.id) ? [] : child.children?.attached ?? [])
            .map(t => layout(t, depth + 2, branchIndex, "right", child.id));
          const slots = leaves.map(f => {
            const n = f.nodes[0];
            const anchorY = n.y + n.height * (n.shape.toLowerCase().includes("underline") ? 1 : 0.5);
            const above = anchorY - f.bounds.y, below = f.bounds.y + f.bounds.height - anchorY;
            return { anchorY, before: sign < 0 ? above : below, after: sign < 0 ? below : above };
          });
          const reach = Math.max(90, slots.reduce((sum, slot) => sum + slot.before + slot.after + 24, 0) + 48);
          const tip = { x: cursor + reach / Math.sqrt(3), y: sign * reach };
          shift(part, tip.x, tip.y + sign * cause.height / 2);
          let distance = reach;
          leaves.forEach((leaf, k) => {
            distance -= 24 + slots[k].before;
            const anchor = { x: cursor + distance / Math.sqrt(3), y: sign * distance };
            const leafRoot = leaf.nodes[0];
            shift(leaf, anchor.x + 24 - leaf.bounds.x,
              anchor.y - slots[k].anchorY);
            part.nodes.push(...leaf.nodes);
            part.edges.push({ from: child.id, to: leafRoot.topic.id,
              direction: "right", brace: false,
              points: [anchor, { x: leafRoot.x, y: anchor.y }] }, ...leaf.edges);
            distance -= slots[k].after;
          });
          part.bounds = boundsOf(part.nodes);
          pairRight = Math.max(pairRight, part.bounds.x + part.bounds.width);
          ribs.push({ part, base: cursor, tip });
        }
        cursor = pairRight + 64;
      }
      ribs.forEach(({ part, base, tip }, i) => {
        fragment.nodes.push(...part.nodes);
        fragment.edges.push({ from: topic.id, to: part.nodes[0].topic.id,
          direction: "fishbone", brace: false,
          points: [{ x: base, y: 0 }, tip],
          trunk: i === ribs.length - 1 ? [{ x: width / 2, y: 0 }, { x: cursor - 40, y: 0 }] : undefined }, ...part.edges);
      });
      if (sc.toLowerCase().includes("rightheaded")) {
        for (const n of fragment.nodes.slice(1)) n.x = -n.x - n.width;
        for (const edge of fragment.edges) {
          for (const point of [...(edge.points ?? []), ...(edge.trunk ?? [])]) point.x = -point.x;
          if (edge.direction === "right") edge.direction = "left";
          else if (edge.direction === "left") edge.direction = "right";
        }
      }
    } else if (direction === "timeline") {
      let cursor = width / 2 + 90;
      children.forEach((child, i) => {
        const d = i % 2 === 0 ? "up" : "down";
        const part = layout(child, depth + 1, i, d, topic.id);
        const b = part.bounds;
        shift(part, cursor - b.x, d === "up" ? -64 - b.y - b.height : 64 - b.y);
        cursor += b.width + 50;
        add(part, direction);
      });
    } else arrange(children, direction);
    // Floating topics are independent subtrees at source coordinates.
    for (const [i, t] of (topic.children?.detached ?? []).entries()) {
      const f = layout(
        t,
        depth + 1,
        branch + i,
        "right",
        topic.id,
        true,
        "floatingTopic",
      );
      shift(
        f,
        t.position?.x ?? width + 160,
        t.position?.y ?? height + 140 + i * 180,
      );
      fragment.nodes.push(...f.nodes);
      fragment.edges.push(...f.edges);
    }
    for (const [i, t] of (topic.children?.callout ?? []).entries()) {
      const f = layout(
        t,
        depth + 1,
        branch,
        "right",
        topic.id,
        false,
        "calloutTopic",
      );
      shift(
        f,
        width / 2 + 30 - f.bounds.x,
        -height / 2 - 38 - f.bounds.y - f.bounds.height - i * 80,
      );
      add(f, "up");
    }
    fragment.bounds = boundsOf([...fragment.nodes, ...fragment.edges.flatMap(e =>
      [...(e.points ?? []), ...(e.trunk ?? [])].map(p => ({ ...p, width: 0, height: 0 }))) ]);
    return fragment;
  }
  const initial = layout(
    sheet.rootTopic,
    0,
    0,
    directionOf(sheet.rootTopic.structureClass),
  );
  const groups: SceneGroup[] = [];
  for (const n of [...initial.nodes]) {
    const rangeBox = (g: Group) => {
      const m = /^\((\d+),(\d+)\)$/.exec(g.range ?? "");
      if (!m) return;
      const ids = new Set<string>();
      const collect = (t: Topic) => {
        ids.add(t.id);
        for (const c of t.children?.attached ?? []) collect(c);
      };
      (n.topic.children?.attached ?? [])
        .slice(+m[1], +m[2] + 1)
        .forEach(collect);
      const nodes = initial.nodes.filter((v) => ids.has(v.topic.id));
      if (!nodes.length) return;
      const b = boundsOf(nodes);
      return {
        x: b.x - 14,
        y: b.y - 14,
        width: b.width + 28,
        height: b.height + 28,
      };
    };
    for (const g of n.topic.boundaries ?? []) {
      const b = rangeBox(g);
      if (b)
        groups.push({
          ...b,
          id: g.id,
          title: g.title ?? "",
          summary: false,
          properties: {
            ...sheet.theme?.boundary?.properties,
            ...g.style?.properties,
          },
        });
    }
    for (const g of n.topic.summaries ?? []) {
      const b = rangeBox(g);
      if (!b) continue;
      const summary = n.topic.children?.summary?.find(
        (t) => t.id === g.topicId,
      );
      const dx = b.x + b.width / 2 - n.x - n.width / 2,
        dy = b.y + b.height / 2 - n.y - n.height / 2;
      const side =
        Math.abs(dx) >= Math.abs(dy)
          ? dx < 0
            ? "left"
            : "right"
          : dy < 0
            ? "up"
            : "down";
      groups.push({
        ...b,
        side,
        id: g.id,
        title: summary ? "" : (g.title ?? ""),
        summary: true,
        properties: {
          ...sheet.theme?.summary?.properties,
          ...g.style?.properties,
        },
      });
      if (summary) {
        const f = layout(
          summary,
          n.depth + 1,
          n.branch,
          side,
          n.topic.id,
          false,
          "summaryTopic",
        );
        if (side === "left")
          shift(f, b.x - 36 - f.bounds.x - f.bounds.width, b.y + b.height / 2);
        else if (side === "right")
          shift(f, b.x + b.width + 36 - f.bounds.x, b.y + b.height / 2);
        else
          shift(
            f,
            b.x + b.width / 2,
            side === "up"
              ? b.y - 36 - f.bounds.y - f.bounds.height
              : b.y + b.height + 36 - f.bounds.y,
          );
        initial.nodes.push(...f.nodes);
        initial.edges.push(...f.edges);
      }
    }
  }
  const b = boundsOf([...initial.nodes, ...groups]);
  return {
    ...initial,
    groups,
    bounds: {
      x: b.x - 70,
      y: b.y - 70,
      width: b.width + 140,
      height: b.height + 140,
    },
    warnings: [...warnings],
    background:
      sheet.style?.properties?.["svg:fill"] ??
      sheet.theme?.map?.properties?.["svg:fill"] ??
      "#ffffff",
  };
}
export function edgePath(edge: Edge, from: SceneNode, to: SceneNode): string {
  if (edge.points) return [edge.trunk ?? [], edge.points].map(points =>
    points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ")).join(" ").trim();
  const cx = (n: Box) => n.x + n.width / 2,
    cy = (n: Box) => n.y + n.height / 2;
  const d = edge.direction;
  if (d === "timeline" || d === "fishbone") {
    const x = from.x + from.width,
      y = cy(from),
      tx = cx(to),
      ty = cy(to) < y ? to.y + to.height : to.y;
    return d === "fishbone"
      ? `M${x},${y} H${tx - 30} L${tx},${ty}`
      : `M${x},${y} H${tx} V${ty}`;
  }
  const vertical = d === "up" || d === "down";
  const x1 = vertical ? cx(from) : d === "left" ? from.x : from.x + from.width;
  const y1 = vertical ? (d === "up" ? from.y : from.y + from.height) : cy(from);
  const x2 = vertical ? cx(to) : d === "left" ? to.x + to.width : to.x;
  const y2 = vertical ? (d === "up" ? to.y + to.height : to.y) : cy(to);
  const lineClass =
    to.properties["line-class"] ?? from.properties["line-class"] ?? "";
  if (lineClass.includes("straight")) return `M${x1},${y1} L${x2},${y2}`;
  if (
    lineClass.includes("elbow") ||
    vertical ||
    edge.brace ||
    (from.topic.structureClass ?? "").includes("org-chart")
  ) {
    return vertical
      ? `M${x1},${y1} V${(y1 + y2) / 2} H${x2} V${y2}`
      : `M${x1},${y1} H${(x1 + x2) / 2} V${y2} H${x2}`;
  }
  if (from.depth === 0 && !vertical) {
    // The main branch emerges from underneath the central topic, easing into
    // the child's horizontal tangent instead of meeting at one exposed joint.
    const start = cx(from) + ((d === "left" ? -1 : 1) * from.width) / 3;
    return `M${start},${y1} Q${start + (x2 - start) * 0.2},${y2} ${x2},${y2}`;
  }
  return vertical
    ? `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`
    : `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
}

/** One shared brace per parent, instead of approximating braces with elbows. */
export function braceConnector(
  from: SceneNode,
  targets: SceneNode[],
  left: boolean,
): string {
  if (!targets.length) return "";
  const sign = left ? -1 : 1,
    origin = left ? from.x : from.x + from.width;
  const ys = targets.map((n) => n.y + n.height / 2),
    top = Math.min(...ys),
    bottom = Math.max(...ys),
    mid = (top + bottom) / 2;
  const edge = left
    ? Math.max(...targets.map((n) => n.x + n.width))
    : Math.min(...targets.map((n) => n.x));
  const spine = (origin + edge) / 2,
    x = (offset: number) => spine + sign * offset;
  if (top === bottom) return `M${origin},${from.y + from.height / 2} H${edge}`;
  const r = Math.min(12, (bottom - top) / 4);
  return `M${origin},${from.y + from.height / 2} H${x(-r)} V${mid} M${x(r)},${top} Q${x(0)},${top} ${x(0)},${top + r} V${mid - r} Q${x(0)},${mid} ${x(-r)},${mid} Q${x(0)},${mid} ${x(0)},${mid + r} V${bottom - r} Q${x(0)},${bottom} ${x(r)},${bottom}`;
}
