import type { Group, Topic } from "./document";
import type { Box, SceneNode } from "./scene";
import { nodeVisualBounds } from "./scene";

export function groupRange(
  group: Group,
): { start: number; end: number } | null {
  const match = /^\((\d+),(\d+)\)$/.exec(group.range ?? "");
  return match ? { start: Number(match[1]), end: Number(match[2]) } : null;
}
export function groupRangeBounds(
  owner: Topic,
  start: number,
  end: number,
  nodes: readonly SceneNode[],
): Box | null {
  const ids = new Set<string>();
  const visit = (topic: Topic) => {
    ids.add(topic.id);
    topic.children?.attached?.forEach(visit);
  };
  owner.children?.attached?.slice(start, end + 1).forEach(visit);
  const boxes = nodes.filter((n) => ids.has(n.topic.id)).map(nodeVisualBounds);
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x)) - 14,
    y = Math.min(...boxes.map((b) => b.y)) - 14;
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x + 14,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y + 14,
  };
}
export function nearestGroupMember(
  owner: Topic,
  nodes: readonly SceneNode[],
  axis: "x" | "y",
  coordinate: number,
): number | null {
  const indices = new Map(
    (owner.children?.attached ?? []).map((t, i) => [t.id, i]),
  );
  let nearest: number | null = null,
    distance = Infinity;
  for (const node of nodes) {
    const index = indices.get(node.topic.id);
    if (index === undefined) continue;
    const value = node[axis] + (axis === "x" ? node.width : node.height) / 2,
      d = Math.abs(value - coordinate);
    if (d < distance) {
      distance = d;
      nearest = index;
    }
  }
  return nearest;
}

/** Handle placement follows the displayed sibling order, including reverse timelines. */
export function groupRangeReversed(
  owner: Topic,
  nodes: readonly SceneNode[],
  axis: "x" | "y",
): boolean {
  const byId = new Map(nodes.map((node) => [node.topic.id, node]));
  const visible = (owner.children?.attached ?? [])
    .map((topic) => byId.get(topic.id))
    .filter((node): node is SceneNode => !!node);
  if (visible.length < 2) return false;
  const center = (node: SceneNode) =>
    node[axis] + (axis === "x" ? node.width : node.height) / 2;
  return center(visible[0]) > center(visible[visible.length - 1]);
}

export function groupRangeAxis(
  owner: SceneNode,
  nodes: readonly SceneNode[],
): "x" | "y" {
  const ids = new Set((owner.topic.children?.attached ?? []).map((t) => t.id));
  const siblings = nodes.filter((node) => ids.has(node.topic.id));
  const spread = (axis: "x" | "y") => {
    const centers = siblings.map((node) =>
      node[axis] + (axis === "x" ? node.width : node.height) / 2);
    return centers.length ? Math.max(...centers) - Math.min(...centers) : 0;
  };
  // Timeline renderers also use down/left to place summaries and connections;
  // that direction does not describe the order of their sibling topics.
  if (owner.topic.structureClass?.includes("timeline") ||
      owner.direction === "timeline" || owner.direction === "fishbone") {
    if (siblings.length > 1) return spread("x") > spread("y") ? "x" : "y";
    return owner.topic.structureClass?.includes("vertical") ? "y" : "x";
  }
  return owner.direction === "up" || owner.direction === "down" ? "x" : "y";
}
