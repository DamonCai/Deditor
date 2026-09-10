import { relationshipGeometry } from "./relationship";
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
  labels: (Box & { lines: string[] })[];
  indicators: TopicIndicator[];
  indicatorColumns: number;
  labelY: number;
  indicatorY: number;
  titleX: number;
  indicatorPositions: { x: number; y: number }[];
  fontSize: number;
  fill: string;
  color: string;
  stroke: string;
  lineColor: string;
  shape: string;
  properties: Properties;
  branch: number;
  detached: boolean;
  direction: Direction;
}
export interface Edge {
  from: string;
  to: string;
  direction: Direction;
  brace: boolean;
  callout?: boolean;
  roundedCorner?: boolean;
  points?: { x: number; y: number }[];
  trunk?: { x: number; y: number }[];
}
export interface SceneGroup extends Box {
  id: string;
  parent: string;
  title: string;
  titleLines: string[];
  titleWidth: number;
  titleHeight: number;
  titleFontSize: number;
  titleLineHeight: number;
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
  ["org.xmind.ui.fishbone.rightHeaded", "fishboneRight"],
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
export function styleFor(
  sheet: Sheet,
  topic: Topic,
  depth: number,
  branch: number,
  kind?: "floatingTopic" | "calloutTopic" | "summaryTopic",
  connection?: Properties,
) {
  const theme = sheet.theme ?? {};
  const colors =
    (
      theme.map?.properties?.["multi-line-colors"] ??
      theme.map?.properties?.["color-list"]
    )
      ?.split(/\s+/)
      .filter(Boolean) ??
    [theme.centralTopic?.properties?.["line-color"] ?? "#141414"];
  const branchColor = colors[branch % colors.length] ?? "#141414";
  const p: Properties = {
    "fo:font-weight": kind === "summaryTopic" ? "400" : kind === "floatingTopic" ? "500" : depth === 0 ? "800" : depth === 1 ? "500" : "400",
    ...connection,
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
        number(p["fo:font-size"], kind === "floatingTopic" || kind === "summaryTopic" ? 14 : depth === 0 ? 30 : depth === 1 ? 18 : 14),
      ),
    ),
    fill: p["fill-pattern"] === "none" ? "none" : p["svg:fill"] ??
      (kind === "floatingTopic" || kind === "summaryTopic" ? "#00897B" : kind === "calloutTopic" ? "#EEEEEE" : depth === 0 ? "#3949AB" : depth === 1 ? "#EEEEEE" : "none"),
    color: p["fo:color"] ?? (depth === 0 || kind === "floatingTopic" || kind === "summaryTopic" ? "#FFFFFF" : "#333333"),
    stroke: p["border-line-color"] ?? (kind === "calloutTopic" ? "none" : p["line-color"] ?? branchColor),
    lineColor: p["line-color"] ?? branchColor,
    shape: p["shape-class"] ?? (kind === "calloutTopic" || kind === "floatingTopic" || kind === "summaryTopic" || depth < 2 ? "roundedRect" : "underline"),
  };
}
/** Resolve inspector values through the same topic tiers and branch inheritance as the canvas. */
export function topicStyle(sheet: Sheet, id: string): ReturnType<typeof styleFor> {
  const visit = (topic: Topic, depth: number, branch: number,
    kind?: "floatingTopic" | "calloutTopic" | "summaryTopic", connection?: Properties): ReturnType<typeof styleFor> | undefined => {
    const style = styleFor(sheet,topic,depth,branch,kind,connection);
    if(topic.id===id) return style;
    for(const group of ["attached","detached","callout","summary"] as const) {
      for(const [i,child] of (topic.children?.[group] ?? []).entries()) {
        const childKind = group === "detached" ? "floatingTopic" : group === "callout" ? "calloutTopic" : group === "summary" ? "summaryTopic" : undefined;
        const nextBranch = group === "detached" ? branch+i : group === "attached" && depth===0 ? i : branch;
        const found=visit(child,depth+1,nextBranch,childKind,group === "attached" && depth>0 ? connectionStyle(style) : undefined);
        if(found) return found;
      }
    }
  };
  return visit(sheet.rootTopic,0,0) ?? styleFor(sheet,sheet.rootTopic,0,0);
}
export function groupStyle(sheet: Sheet, group: Group, summary: boolean): Properties {
  return {
    "line-color": "#00897B", "svg:fill": "#00897B", "svg:fill-opacity": "0.2", "fo:color": "#FFFFFF",
    ...defined(sheet.theme?.[summary ? "summary" : "boundary"]?.properties),
    ...defined(group.style?.properties),
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
  groups: SceneGroup[];
  nodes: SceneNode[];
  edges: Edge[];
  bounds: Box;
}
function shift(fragment: Fragment, x: number, y: number) {
  for (const g of fragment.groups) { g.x += x; g.y += y; }
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
  function groupTitle(title: string, width: number, properties: Properties) {
    const titleFontSize = Math.max(9, Math.min(64, number(properties["fo:font-size"],14)));
    const titleLineHeight = titleFontSize + 4;
    const titleLines = title ? wrap(title,Math.max(titleFontSize*2,Math.min(160,width/2)-12),titleFontSize,properties,measure) : [];
    return {titleLines,titleFontSize,titleLineHeight,
      titleWidth: titleLines.length ? Math.max(40,...titleLines.map(line=>measure(line,titleFontSize,properties)+12)) : 0,
      titleHeight: titleLines.length ? titleLines.length*titleLineHeight+8 : 0};
  }
  const groupBounds = (g: SceneGroup): Box => ({
    x:g.x-Math.max(0,g.titleWidth-g.width)/2,y:g.y-g.titleHeight,
    width:Math.max(g.width,g.titleWidth),height:g.height+g.titleHeight,
  });
  function layout(
    topic: Topic,
    depth: number,
    branch: number,
    inherited: Direction,
    parent?: string,
    detached = false,
    kind?: "floatingTopic" | "calloutTopic" | "summaryTopic",
    connection?: Properties,
    inheritedBrace = false,
  ): Fragment {
    const style = styleFor(sheet, topic, depth, branch, kind, connection),
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
    // Keep each label as a separate capsule. Long labels wrap within their own
    // box instead of merging unrelated labels into a single text paragraph.
    const labels = (topic.labels ?? []).map((label) => {
      const lines = wrap(label, Math.max(60, widthHint) - 16, 11, auxiliary, measure);
      return { lines, x: 0, y: 0,
        width: Math.max(20, ...lines.map((line) => measure(line, 11, auxiliary) + 16)),
        height: lines.length * 16 + 4 };
    });
    const labelLines = labels.flatMap((label) => label.lines);
    const labelsHeight = labels.reduce((total, label) => total + label.height + 4, 0);
    const indicators = topicIndicators(topic);
    const inlineIcons = indicators.filter(i => i.kind === "notes" || i.kind === "link");
    const rowIcons = indicators.filter(i => i.kind !== "notes" && i.kind !== "link");
    const inlineWidth = inlineIcons.length ? inlineIcons.length * 20 + 4 : 0;
    const titleWidth = Math.max(24, ...lines.map(s => measure(s, style.fontSize, p)));
    const indicatorColumns = Math.max(1, Math.min(rowIcons.length,
      Math.floor((Math.max(60, widthHint) + 4) / 20)));
    const indicatorRows = Math.ceil(rowIcons.length / indicatorColumns);
    const contentWidth = Math.max(24, imageWidth,
      titleWidth + inlineWidth,
      ...labels.map((label) => label.width),
      rowIcons.length ? indicatorColumns * 20 - 4 : 0);
    const titleHeight = lines.length * style.fontSize * 1.4;
    const pictureHeight = imageHeight ? imageHeight + 8 : 0;
    const contentHeight = pictureHeight + titleHeight +
      (labels.length ? 4 + labelsHeight : 0) +
      (indicatorRows ? 4 + indicatorRows * 20 : 0);
    const paddedWidth = Math.max(depth === 0 ? 100 : 50,
      contentWidth + (kind === "floatingTopic" ? 26 : depth === 0 ? 64 : depth === 1 ? 40 : 12));
    const paddedHeight = contentHeight + (depth === 0 ? 36 : depth === 1 && !kind ? 22 : 18);
    const shape = style.shape.toLowerCase();
    // Inscribe the padded content rectangle in curved / tapered shapes.
    const factor = shape.includes("diamond") ? 2 : /ellipse|oval/.test(shape) ? Math.SQRT2 : 1;
    const width = /pill/.test(shape) ? paddedWidth + paddedHeight : paddedWidth * factor;
    const height = paddedHeight * factor;
    const content = { x: (width - contentWidth) / 2, y: (height - contentHeight) / 2,
      width: contentWidth, height: contentHeight };
    const labelY = content.y + pictureHeight + titleHeight + 6;
    let nextLabelY = labelY;
    for (const label of labels) {
      label.x = (width - label.width) / 2;
      label.y = nextLabelY;
      nextLabelY += label.height + 4;
    }
    const indicatorY = content.y + pictureHeight + titleHeight +
      (labels.length ? 4 + labelsHeight : 0) + 4;
    const titleX = (width - inlineWidth) / 2;
    let inlineIndex = 0, rowIndex = 0;
    const indicatorPositions = indicators.map(icon => {
      if (icon.kind === "notes" || icon.kind === "link") return {
        x: titleX + titleWidth / 2 + 6 + inlineIndex++ * 20,
        y: content.y + pictureHeight + (titleHeight - 16) / 2,
      };
      const index = rowIndex++, row = Math.floor(index / indicatorColumns);
      const columns = Math.min(indicatorColumns, rowIcons.length - row * indicatorColumns);
      return { x: (width - (columns * 20 - 4)) / 2 + (index % indicatorColumns) * 20,
        y: indicatorY + row * 20 };
    });
    const node: SceneNode = {
      topic,
      parent,
      depth,
      branch,
      detached,
      direction: inherited,
      lines,
      content, imageHeight, labelLines, labels, indicators, indicatorColumns, labelY, indicatorY, titleX, indicatorPositions,
      ...style,
      x: -width / 2,
      y: -height / 2,
      width,
      height,
    };
    const fragment: Fragment = { nodes: [node], edges: [], groups: [], bounds: node };
    const children = folded.has(topic.id)
      ? []
      : (topic.children?.attached ?? []);
    let direction = topic.structureClass
      ? directionOf(topic.structureClass)
      : inherited;
    if (depth > 0 && !detached && direction === "side")
      direction = inherited === "left" ? "left" : "right";
    node.direction = direction;
    const sc = topic.structureClass ?? "";
    if (
      sc &&
      (!/map|logic|org-chart|tree|brace|timeline|fishbone/.test(sc) ||
        (/timeline/.test(sc) && sc !== "org.xmind.ui.timeline.horizontal"))
    )
      warnings.add(sc);
    const brace = topic.structureClass ? sc.includes("brace") : inheritedBrace;
    const childIndices = new Map(children.map((child, i) => [child.id, i]));
    const add = (f: Fragment, d: Direction) => {
      fragment.nodes.push(...f.nodes);
      fragment.groups.push(...f.groups);
      fragment.edges.push(
        { from: topic.id, to: f.nodes[0].topic.id, direction: d, brace },
        ...f.edges,
      );
    };
    const arrange = (topics: Topic[], d: Direction) => {
      const vertical = d === "down" || d === "up";
      const parts = topics.map((t) =>
        layout(t, depth + 1, depth === 0 ? childIndices.get(t.id)! : branch, d, topic.id,
          false, undefined, depth > 0 ? connectionStyle(node) : undefined, brace),
      );
      const gap = vertical ? depth === 0 ? 36 : 6 : depth === 0 ? 35 : 2;
      const groupRanges = [...(topic.boundaries ?? []), ...(topic.summaries ?? [])].flatMap(g => {
        const match = /^\((\d+),(\d+)\)$/.exec(g.range ?? "");
        if(!match) return [];
        const members=new Set(children.slice(+match[1],+match[2]+1).map(t=>t.id));
        const indices=topics.flatMap((t,i)=>members.has(t.id)?[i]:[]);
        return indices.length ? [{start:Math.min(...indices),end:Math.max(...indices),title:g.title ?? "",properties:groupStyle(sheet,g,!!g.topicId)}] : [];
      });
      const before: number[] = parts.map((_,i)=>Math.max(0,...groupRanges.filter(g=>g.start===i).map(g=> {
        const width = Math.max(...parts.slice(g.start,g.end+1).map(p=>p.bounds.width)) + 28;
        return vertical ? 18 : 18 + groupTitle(g.title,width,g.properties).titleHeight;
      })));
      const after: number[] = parts.map((_,i)=>groupRanges.some(g=>g.end===i) ? 18 : 0);
      const length = before.reduce((a,b)=>a+b,0) + after.reduce((a,b)=>a+b,0) +
        parts.reduce(
          (sum, f) => sum + (vertical ? f.bounds.width : f.bounds.height),
          0,
        ) +
        gap * Math.max(0, parts.length - 1);
      let cursor = -length / 2;
      for (const [partIndex, part] of parts.entries()) {
        cursor += before[partIndex];
        const b = part.bounds;
        if (vertical) {
          shift(
            part,
            cursor - b.x,
            d === "down"
              ? height / 2 + (depth === 0 ? 100 : 24) - b.y
              : -height / 2 - (depth === 0 ? 100 : 24) - b.y - b.height,
          );
          cursor += b.width + gap;
        } else {
          shift(
            part,
            d === "left"
              ? -width / 2 -
                  (brace ? depth === 0 ? 64 : 44 : depth === 0 ? direction === "side" ? 51 : 100 : 12) -
                  b.x -
                  b.width
              : width / 2 + (brace ? depth === 0 ? 64 : 44 : depth === 0 ? direction === "side" ? 51 : 100 : 12) - b.x,
            cursor - b.y,
          );
          cursor += b.height + gap;
        }
        cursor += after[partIndex];
        add(part, d);
      }
      if (vertical && parts.length) {
        const first=parts[0].nodes[0],last=parts[parts.length-1].nodes[0];
        const center=(first.x+first.width/2+last.x+last.width/2)/2;
        for(const part of parts) shift(part,-center,0);
      }
      if (!vertical && parts.length) {
        // Center the attachment points, not subtree bounding boxes. Underlined
        // topics attach at their bottom edge, and labels can make a subtree
        // asymmetric without moving its parent away from the branch midpoint.
        const anchorY = (part: Fragment) => {
          const n=part.nodes[0];
          return n.y+n.height*(!brace && n.shape.toLowerCase().includes("underline") ? 1 : 0.5);
        };
        const center=(anchorY(parts[0])+anchorY(parts[parts.length-1]))/2;
        for(const part of parts) shift(part,0,-center);
        if(direction === "side") {
          const clearance=(part: Fragment)=>(height+part.nodes[0].height)/2+3;
          if(parts.length===1) {
            shift(parts[0],0,(d === "left" ? 1 : -1)*clearance(parts[0]));
          } else if(parts.length%2===0) {
            const middle=parts.length/2;
            const extra=Math.max(0,clearance(parts[middle-1])+anchorY(parts[middle-1]),
              clearance(parts[middle])-anchorY(parts[middle]));
            parts.forEach((part,i)=>shift(part,0,i<middle ? -extra : extra));
          }
        }
        const anchors = parts.map(part => {
          const n = part.nodes[0];
          return { id: n.topic.id, y: n.y + n.height * (n.shape.toLowerCase().includes("underline") ? 1 : 0.5) };
        });
        const top = Math.min(...anchors.map(a => a.y)), bottom = Math.max(...anchors.map(a => a.y));
        const anchorById = new Map(anchors.map(a => [a.id, a]));
        for (const edge of fragment.edges.filter(e => e.from === topic.id)) {
          const anchor = anchorById.get(edge.to);
          if (anchor) edge.roundedCorner = anchor.y === top || anchor.y === bottom;
        }
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
        : Math.min(children.length, Math.max(2, Math.ceil(children.length / 2)));
      arrange(children.slice(0, split), "right");
      arrange(children.slice(split).reverse(), "left");
    } else if (direction === "fishbone") {
      // Each cause is a diagonal rib. Its children join successive points on
      // that rib horizontally, ordered from the tip towards the spine.
      let cursor = width / 2 + 50;
      const ribs: { part: Fragment; base: number; tip: { x: number; y: number } }[] = [];
      const laneEnds = [-Infinity, -Infinity];
      for (let j = 0; j < children.length; j++) {
          const child = children[j], sign = j % 2 === 0 ? -1 : 1;
          // Upper and lower ribs share horizontal space, while each side
          // reserves its own content width. Consecutive joints stay staggered.
          const base = Math.max(cursor, laneEnds[j % 2] + 44);
          const branchIndex = depth === 0 ? j : branch;
          const bare = { ...child, children: { ...child.children, attached: [] } };
          const part = layout(bare, depth + 1, branchIndex, "right", topic.id);
          const cause = part.nodes[0];
          cause.topic = child;
          const leaves = (folded.has(child.id) ? [] : child.children?.attached ?? [])
            .map(t => layout(t, depth + 2, branchIndex, "right", child.id, false, undefined, connectionStyle(cause)));
          const slots = leaves.map(f => {
            const n = f.nodes[0];
            const anchorY = n.y + n.height * (n.shape.toLowerCase().includes("underline") ? 1 : 0.5);
            const above = anchorY - f.bounds.y, below = f.bounds.y + f.bounds.height - anchorY;
            return { anchorY, before: sign < 0 ? above : below, after: sign < 0 ? below : above };
          });
          const minimumReach = folded.has(child.id) && child.children?.attached?.length ? 70 : 50;
          const reach = Math.max(minimumReach, slots.reduce((sum, slot, k) => sum + slot.before + slot.after + (k ? 3 : 24), 0) + 48);
          const tip = { x: base + reach / Math.sqrt(3), y: sign * reach };
          shift(part, tip.x, tip.y + sign * cause.height / 2);
          let distance = reach;
          leaves.forEach((leaf, k) => {
            distance -= (k ? 3 : 24) + slots[k].before;
            const anchor = { x: base + distance / Math.sqrt(3), y: sign * distance };
            const leafRoot = leaf.nodes[0];
            shift(leaf, anchor.x + 24 - leaf.bounds.x,
              anchor.y - slots[k].anchorY);
            part.nodes.push(...leaf.nodes);
            part.groups.push(...leaf.groups);
            part.edges.push({ from: child.id, to: leafRoot.topic.id,
              direction: "right", brace: false,
              points: [anchor, { x: leafRoot.x, y: anchor.y }] }, ...leaf.edges);
            distance -= slots[k].after;
          });
          attachGroups(part, cause);
          part.bounds = boundsOf([...part.nodes, ...part.groups]);
          laneEnds[j % 2] = part.bounds.x + part.bounds.width;
          ribs.push({ part, base, tip });
          cursor = base + 36;
      }
      ribs.forEach(({ part, base, tip }, i) => {
        fragment.nodes.push(...part.nodes);
        fragment.groups.push(...part.groups);
        fragment.edges.push({ from: topic.id, to: part.nodes[0].topic.id,
          direction: "fishbone", brace: false,
          points: [{ x: base, y: 0 }, tip],
          trunk: i === ribs.length - 1 ? [{ x: width / 2, y: 0 }, { x: cursor + 28, y: 0 }] : undefined }, ...part.edges);
      });
      if (sc.toLowerCase().includes("rightheaded")) {
        for (const n of fragment.nodes.slice(1)) n.x = -n.x - n.width;
        for (const g of fragment.groups) { g.x = -g.x - g.width; if(g.side === "right") g.side="left"; else if(g.side === "left") g.side="right"; }
        for (const edge of fragment.edges) {
          for (const point of [...(edge.points ?? []), ...(edge.trunk ?? [])]) point.x = -point.x;
          if (edge.direction === "right") edge.direction = "left";
          else if (edge.direction === "left") edge.direction = "right";
        }
      }
    } else if (direction === "timeline" && sc === "org.xmind.ui.timeline.horizontal") {
      // Milestones sit on the axis. Their details alternate above and below,
      // with a shared vertical stem beside a compact stack of rightward topics.
      let cursor = width / 2 + 100;
      let previous = node;
      children.forEach((child, i) => {
        const branchIndex = depth === 0 ? i : branch;
        const above = i % 2 === 0;
        const bare = child.structureClass ? child : { ...child, children: { ...child.children, attached: [] } };
        const part = layout(bare, depth + 1, branchIndex, "right", topic.id);
        const milestone = part.nodes[0];
        milestone.topic = child;
        shift(part, cursor - milestone.x, -milestone.y - milestone.height / 2);
        if (!child.structureClass) {
          milestone.direction = above ? "up" : "down";
          const details = (folded.has(child.id) ? [] : child.children?.attached ?? [])
            .map(t => layout(t, depth + 2, branchIndex, "right", child.id, false, undefined, connectionStyle(milestone)));
          const total = details.reduce((sum, f) => sum + f.bounds.height, 0) + Math.max(0, details.length - 1) * 3;
          let y = above ? milestone.y - 28 - total : milestone.y + milestone.height + 24;
          const x = milestone.x + milestone.width / 2;
          details.forEach(detail => {
            const h = detail.bounds.height;
            shift(detail, x + 24 - detail.bounds.x, y - detail.bounds.y);
            y += h + 3;
            const target = detail.nodes[0];
            const anchorY = target.y + target.height * (target.shape.toLowerCase().includes("underline") ? 1 : 0.5);
            part.nodes.push(...detail.nodes);
            part.groups.push(...detail.groups);
            part.edges.push({ from: child.id, to: target.topic.id, direction: "right", brace: false, roundedCorner: true,
              points: [{ x, y: above ? milestone.y : milestone.y + milestone.height }, { x, y: anchorY }, { x: target.x, y: anchorY }] }, ...detail.edges);
          });
          attachGroups(part, milestone);
          part.bounds = boundsOf([...part.nodes, ...part.groups.map(groupBounds)]);
        }
        // Opposite sides may share horizontal space. Only boxes occupying
        // the same vertical band need clearance; a long upper detail must not
        // push the next lower milestone away from the axis rhythm.
        let clearance = 0;
        const occupied = [...fragment.nodes, ...fragment.groups.map(groupBounds)];
        for (const next of [...part.nodes, ...part.groups.map(groupBounds)]) {
          for (const prior of occupied) {
            if (next.y < prior.y + prior.height && prior.y < next.y + next.height)
              clearance = Math.max(clearance, prior.x + prior.width + 24 - next.x);
          }
        }
        if (clearance > 0) shift(part, clearance, 0);
        fragment.nodes.push(...part.nodes);
        fragment.groups.push(...part.groups);
        fragment.edges.push({ from: topic.id, to: child.id, direction: "timeline", brace: false,
          points: [{ x: previous.x + previous.width, y: 0 }, { x: milestone.x, y: 0 }] }, ...part.edges);
        previous = milestone;
        cursor = milestone.x + milestone.width + 100;
      });
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
      fragment.groups.push(...f.groups);
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
        t.position?.x ?? 0,
        t.position?.y ?? -height / 2 - 80 - f.nodes[0].height / 2 - i * 80,
      );
      fragment.nodes.push(...f.nodes);
      fragment.groups.push(...f.groups);
      fragment.edges.push({ from: topic.id, to: t.id, direction: "up", brace: false, callout: true }, ...f.edges);
    }
    attachGroups(fragment, node);
    fragment.bounds = boundsOf([...fragment.nodes, ...fragment.groups.map(groupBounds), ...fragment.edges.flatMap(e =>
      [...(e.points ?? []), ...(e.trunk ?? [])].map(p => ({ ...p, width: 0, height: 0 }))) ]);
    return fragment;
  }
  const initial = layout(
    sheet.rootTopic,
    0,
    0,
    directionOf(sheet.rootTopic.structureClass),
  );
  function attachGroups(fragment: Fragment, n: SceneNode) {
    const groups = fragment.groups;
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
      const nodes = fragment.nodes.filter((v) => ids.has(v.topic.id));
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
          parent: n.topic.id,
          title: g.title ?? "",
          ...groupTitle(g.title ?? "",b.width,groupStyle(sheet,g,false)),
          summary: false,
          properties: groupStyle(sheet,g,false),
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
      const start = /^\((\d+),/.exec(g.range ?? "");
      const firstMember = start && n.topic.children?.attached?.[Number(start[1])];
      const memberDirection = firstMember && fragment.nodes.find(v=>v.topic.id===firstMember.id)?.direction;
      const direction = n.direction === "side" ? memberDirection : n.direction;
      const side = direction === "left" || direction === "right" || direction === "up" || direction === "down"
        ? direction : Math.abs(dx) >= Math.abs(dy) ? dx < 0 ? "left" : "right" : dy < 0 ? "up" : "down";
      groups.push({
        ...b,
        side,
        id: g.id,
        parent: n.topic.id,
        title: summary ? "" : (g.title ?? ""),
        ...groupTitle(summary ? "" : g.title ?? "",b.width,groupStyle(sheet,g,true)),
        summary: true,
        properties: groupStyle(sheet,g,true),
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
        fragment.nodes.push(...f.nodes);
        fragment.groups.push(...f.groups);
        fragment.edges.push(...f.edges);
      }
    }
  }
  const groups = initial.groups;
  const relationBoxes: Box[] = [];
  const nodeMap = new Map(initial.nodes.map((n) => [n.topic.id, n]));
  for (const relation of sheet.relationships ?? []) {
    const from = nodeMap.get(relation.end1Id), to = nodeMap.get(relation.end2Id);
    if (!from || !to) continue;
    const g = relationshipGeometry(sheet, relation, from, to);
    if (g.unsupportedPolar) warnings.add("relationship-polar-controls");
    // Include the curve's control hull and label in Fit, not just topic boxes.
    for (const point of g.straight ? [g.start, g.end] : [g.start, g.c1, g.c2, g.end])
      relationBoxes.push({ ...point, width: 0, height: 0 });
    const textWidth = measure(relation.title ?? "", g.fontSize, g.properties);
    relationBoxes.push({ x: g.label.x - textWidth / 2, y: g.label.y - g.fontSize,
      width: textWidth, height: g.fontSize * 2 });
  }
  const b = boundsOf([...initial.nodes, ...groups.map(groupBounds), ...relationBoxes]);
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
/** Only branch styling flows down the tree; topic fills/fonts stay tier-specific. */
function connectionStyle(node: Pick<SceneNode, "lineColor" | "properties">): Properties {
  return { "line-color": node.lineColor,
    ...(node.properties["line-class"] ? { "line-class": node.properties["line-class"] } : {}) };
}

/** A filled callout tail joins the facing edges, including side/below callouts. */
export function calloutTailPath(parent: Box, bubble: Box): string {
  if (parent.x < bubble.x + bubble.width && bubble.x < parent.x + parent.width &&
      parent.y < bubble.y + bubble.height && bubble.y < parent.y + parent.height) return "";
  const boundary = (box: Box, other: Box) => {
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const dx = other.x + other.width / 2 - cx, dy = other.y + other.height / 2 - cy;
    const vertical = Math.abs(dy) / box.height >= Math.abs(dx) / box.width;
    const scale = vertical ? box.height / 2 / Math.abs(dy) : box.width / 2 / Math.abs(dx);
    return { x: cx + dx * scale, y: cy + dy * scale, vertical };
  };
  const base = boundary(bubble, parent), tip = boundary(parent, bubble);
  const half = Math.min(8, (base.vertical ? bubble.width : bubble.height) / 4);
  if (base.vertical) {
    const x = Math.max(bubble.x + half, Math.min(bubble.x + bubble.width - half, base.x));
    return `M${x - half},${base.y} L${tip.x},${tip.y} L${x + half},${base.y} Z`;
  }
  const y = Math.max(bubble.y + half, Math.min(bubble.y + bubble.height - half, base.y));
  return `M${base.x},${y - half} L${tip.x},${tip.y} L${base.x},${y + half} Z`;
}

export function edgePath(edge: Edge, from: SceneNode, to: SceneNode): string {
  if (edge.callout) return calloutTailPath(from, to);
  if (edge.points?.length === 3 && edge.roundedCorner) {
    const [a, b, c] = edge.points;
    const dy = Math.sign(b.y - a.y), dx = Math.sign(c.x - b.x);
    const r = Math.min(10, Math.abs(b.y - a.y), Math.abs(c.x - b.x));
    return `M${a.x},${a.y} V${b.y - dy*r} Q${b.x},${b.y} ${b.x + dx*r},${b.y} H${c.x}`;
  }
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
  const y1 = vertical ? (d === "up" ? from.y : from.y + from.height) : from.shape.toLowerCase().includes("underline") ? from.y + from.height : cy(from);
  const x2 = vertical ? cx(to) : d === "left" ? to.x + to.width : to.x;
  const y2 = vertical ? (d === "up" ? to.y + to.height : to.y) : to.shape.toLowerCase().includes("underline") ? to.y + to.height : cy(to);
  const lineClass =
    (from.properties["line-class"] ?? to.properties["line-class"] ?? "").toLowerCase();
  if (lineClass.includes("straight")) return `M${x1},${y1} L${x2},${y2}`;
  if (vertical && (lineClass.includes("roundedelbow") || (!lineClass && from.depth > 0))) {
    const sign = d === "up" ? -1 : 1, turn = Math.sign(x2 - x1);
    const spine = y1 + sign * 14;
    const radius = Math.min(10, Math.abs(x2 - x1), Math.abs(y2 - spine));
    if (!turn) return `M${x1},${y1} V${y2}`;
    return `M${x1},${y1} V${spine} H${x2 - turn * radius} Q${x2},${spine} ${x2},${spine + sign * radius} V${y2}`;
  }
  if (!vertical && (lineClass.includes("roundedelbow") || (!lineClass && from.depth > 0))) {
    // Every sibling uses the same spine beside its parent. The overlapping
    // stem segments form one trunk; only the turn into each child is rounded.
    const sign = d === "left" ? -1 : 1;
    const spine = x1 + sign * Math.min(24, Math.abs(x2 - x1) / 2);
    const r = Math.min(12, Math.abs(y2 - y1), Math.abs(x2 - spine));
    const turn = Math.sign(y2 - y1);
    if (!turn) return `M${x1},${y1} H${x2}`;
    if (edge.roundedCorner === false) return `M${x1},${y1} H${spine} V${y2} H${x2}`;
    return `M${x1},${y1} H${spine} V${y2 - turn * r} Q${spine},${y2} ${spine + sign * r},${y2} H${x2}`;
  }
  if (
    lineClass.includes("elbow") || edge.brace
  ) {
    return vertical
      ? `M${x1},${y1} V${(y1 + y2) / 2} H${x2} V${y2}`
      : `M${x1},${y1} H${(x1 + x2) / 2} V${y2} H${x2}`;
  }
  if (from.depth === 0 && vertical && !lineClass) {
    return `M${x1},${y1} Q${x2},${y1 + (y2 - y1) * 0.2} ${x2},${y2}`;
  }
  if (from.depth === 0 && !vertical && from.direction === "side") {
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
  const r = Math.min(from.depth === 0 ? 18 : 8, Math.abs(edge-origin)/3, (bottom - top) / 4);
  return `M${x(r)},${top} Q${x(0)},${top} ${x(0)},${top + r} V${mid - r} Q${x(0)},${mid} ${x(-r)},${mid} Q${x(0)},${mid} ${x(0)},${mid + r} V${bottom - r} Q${x(0)},${bottom} ${x(r)},${bottom}`;
}
