import type { SceneNode } from "./scene";

export interface DropTarget {
  kind: "child" | "before" | "after" | "invalid";
  target: string;
  parent: string;
  line?: { x1: number; y1: number; x2: number; y2: number };
}

/** Hit-test saved node geometry: dragged previews never obscure the drop target. */
export function topicDropTarget(nodes: SceneNode[], moving: Set<string>, x: number, y: number,
  zoom: number): DropTarget | null {
  const byId = new Map(nodes.map(n => [n.topic.id, n]));
  const gap = 12 / zoom;
  const distance = (n: SceneNode) => Math.hypot(Math.max(n.x-x,0,x-n.x-n.width),Math.max(n.y-y,0,y-n.y-n.height));
  const candidates = [...nodes].reverse().filter(n=>!moving.has(n.topic.id) && distance(n)<=gap)
    .sort((a,b)=>distance(a)-distance(b));
  const blocked = nodes.find(n => moving.has(n.topic.id) && x >= n.x && x <= n.x + n.width && y >= n.y && y <= n.y + n.height);
  if(blocked && (!candidates.length || distance(candidates[0])>0))
    return {kind:"invalid",target:blocked.topic.id,parent:blocked.topic.id};
  for (const n of candidates) {
    const parent = n.parent ? byId.get(n.parent) : undefined;
    const attached = !!parent?.topic.children?.attached?.some(t => t.id === n.topic.id);
    const vertical = parent?.direction === "up" || parent?.direction === "down";
    const fraction = vertical ? (x - n.x) / n.width : (y - n.y) / n.height;
    if (attached && parent && (fraction < 0.25 || fraction > 0.75)) {
      const before = fraction < 0.25;
      // The left half of a mind map is rendered in reverse document order.
      const reversed = parent.direction === "side" && n.direction === "left";
      const kind = before !== reversed ? "before" : "after";
      const line = vertical
        ? { x1: n.x + (before ? -6 : n.width + 6), y1: n.y - 4,
            x2: n.x + (before ? -6 : n.width + 6), y2: n.y + n.height + 4 }
        : { x1: n.x - 4, y1: n.y + (before ? -6 : n.height + 6),
            x2: n.x + n.width + 4, y2: n.y + (before ? -6 : n.height + 6) };
      return { kind, target: n.topic.id, parent: parent.topic.id, line };
    }
    return { kind: "child", target: n.topic.id, parent: n.topic.id };
  }
  return null;
}
