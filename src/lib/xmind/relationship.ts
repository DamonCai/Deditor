import { shapeName, shapePolygon } from "./shapes";
import { advancedShape } from "./shapePaths";
import type { Relationship, Sheet } from "./document";
import type { Box, SceneNode } from "./scene";

export interface Point { x: number; y: number }
export type RelationshipControl = Point | { amount: number; angle: number };
const center = (box: Box): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const cartesian = (value: unknown): value is Point => !!value && typeof value === 'object'
  && finite((value as Point).x) && finite((value as Point).y);
const polar = (value: unknown): value is { amount: number; angle: number } => !!value && typeof value === 'object'
  && finite((value as {amount:number}).amount) && finite((value as {angle:number}).angle);

/** Preserve polar controls when dragging: their origin is the outline endpoint. */
export function movedRelationshipControl(original: unknown, point: Point, topic: Box, start: Point, end: Point): RelationshipControl {
  const dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);
  if(polar(original) && !cartesian(original) && length>1e-8) {
    const px=point.x-start.x,py=point.y-start.y;
    return {amount:Math.hypot(px,py)/length,angle:Math.atan2(py,px)-Math.atan2(dy,dx)};
  }
  const c=center(topic);
  return {x:point.x-c.x,y:point.y-c.y};
}
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
  const polygon = advancedShape(shape,node.width,node.height)?.outline ?? shapePolygon(shape,node.width,node.height);
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

/** Prefer the smallest visible topic under the pointer, excluding the opposite end. */
export function relationshipDropTarget(nodes: readonly SceneNode[], point: Point, otherId: string): SceneNode | undefined {
  return nodes.filter(node => node.topic.id !== otherId && point.x >= node.x && point.x <= node.x + node.width
    && point.y >= node.y && point.y <= node.y + node.height)
    .sort((a,b) => a.width*a.height-b.width*b.height)[0];
}

function routeMidpoint(points: Point[]): Point {
  const lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y));
  let remaining=lengths.reduce((a,b)=>a+b,0)/2;
  for(let i=0;i<lengths.length;i++) {
    if(remaining<=lengths[i]&&lengths[i]>0) {
      const ratio=remaining/lengths[i];
      return {x:points[i].x+(points[i+1].x-points[i].x)*ratio,y:points[i].y+(points[i+1].y-points[i].y)*ratio};
    }
    remaining-=lengths[i];
  }
  return points[0];
}

export function relationshipStyle(sheet: Sheet, relation: Relationship): Record<string,string> {
  const defined=(p?:Record<string,string>)=>Object.fromEntries(Object.entries(p??{}).filter(([,value])=>value!=="inherited"));
  return {...defined(sheet.theme?.relationship?.properties),...defined(relation.style?.properties)};
}
export function relationshipGeometry(sheet: Sheet, relation: Relationship, a: SceneNode, b: SceneNode) {
  const ca = center(a), cb = center(b);
  const properties=relationshipStyle(sheet,relation);
  const shape = (properties["shape-class"] ?? "curve").toLowerCase();
  const controls = relation.controlPoints as Record<string, { x?: number; y?: number; amount?: number; angle?: number }> | undefined;
  const endpoints = relation.lineEndPoints as Record<string, unknown> | undefined;
  // Current XMind's Cartesian control vectors are relative to each topic's
  // centre, confirmed with the generated native control-point probe.
  const distance = Math.hypot(cb.x - ca.x, cb.y - ca.y);
  const reach = Math.max(60, distance * 0.8);
  const horizontal = Math.abs(cb.x - ca.x) >= Math.abs(cb.y - ca.y);
  const flexible=shape.includes('flexible.'), zigzag=shape.includes('zigzag');
  const straight=shape.includes('straight'), angled=/angle|elbow/.test(shape);
  const dx=cb.x-ca.x,dy=cb.y-ca.y;
  const nativeCurve=/^org\.xmind\.relationshipshape\.(curved|angled)$/.test(shape);
  const bend=Math.min(80,Math.max(40,distance*.15));
  const defaultVector=(index:number):Point => {
    if(flexible||zigzag)return {x:dx*(index?-1:1)/3,y:dy*(index?-1:1)/3};
    if(nativeCurve)return horizontal?{x:0,y:bend*(index?-1:1)}:{x:bend*(index?1:-1),y:0};
    return horizontal?{x:0,y:-reach}:{x:reach,y:0};
  };
  const control = (index: number, origin: Point): Point => {
    const point = controls?.[index];
    return finite(point?.x) && finite(point?.y)
      ? { x: origin.x + point.x, y: origin.y + point.y }
      : { x: origin.x + defaultVector(index).x, y: origin.y + defaultVector(index).y };
  };
  let c1 = control(0, ca), c2 = control(1, cb);
  const automatic=![controls?.[0],controls?.[1]].some(p=>cartesian(p)||polar(p));
  const nativeShape=shape.startsWith('org.xmind.relationshipshape.');
  const anchor = (index:number,node:SceneNode,other:Point,control:Point) => {
    const reference=endpoints?.[index],origin=center(node);
    if(cartesian(reference))return topicAnchor(node,{x:origin.x+reference.x,y:origin.y+reference.y});
    return topicAnchor(node,straight || polar(controls?.[index]) || (automatic&&nativeShape) ? other : control);
  };
  const start = anchor(0,a,cb,c1),end=anchor(1,b,ca,c2);
  // Native polar amount is a fraction of the edge-to-edge vector; angle is
  // radians. Rotating the control does not rotate the attachment on the topic.
  const polarControl = (value:unknown,origin:Point,target:Point,fallback:Point) => {
    if(!polar(value)||cartesian(value))return fallback;
    const x=(target.x-origin.x)*value.amount,y=(target.y-origin.y)*value.amount;
    return {x:origin.x+x*Math.cos(value.angle)-y*Math.sin(value.angle),
      y:origin.y+x*Math.sin(value.angle)+y*Math.cos(value.angle)};
  };
  const storedControl=(index:number) => controls?.[index] ?? (!automatic&&nativeShape?{amount:.33,angle:Math.PI/6}:undefined);
  c1=polarControl(storedControl(0),start,end,c1);
  c2=polarControl(storedControl(1),end,start,c2);
  if(automatic&&nativeShape) {
    const ex=end.x-start.x,ey=end.y-start.y;
    if(nativeCurve) {
      // Native generated pair: S-shaped curve/angled line with two opposing bends.
      c1={x:start.x+ex*.27,y:start.y+ey*.27+Math.abs(ex)*.17};
      c2={x:end.x-ex*.27,y:end.y-ey*.27-Math.abs(ex)*.17};
      if(!horizontal) {
        c1={x:start.x+ex*.27-Math.abs(ey)*.17,y:start.y+ey*.27};
        c2={x:end.x-ex*.27+Math.abs(ey)*.17,y:end.y-ey*.27};
      }
    } else if(flexible) {
      c1={x:start.x+ex/3,y:start.y+ey/3};
      c2={x:end.x-ex/3,y:end.y-ey/3};
    }
    if(zigzag) {
      if(horizontal) {
        const x=flexible?start.x+Math.sign(ex)*Math.min(30,Math.abs(ex)/2):(start.x+end.x)/2;
        c1={x,y:start.y};c2={x,y:end.y};
      } else {
        const y=flexible?start.y+Math.sign(ey)*Math.min(30,Math.abs(ey)/2):(start.y+end.y)/2;
        c1={x:start.x,y};c2={x:end.x,y};
      }
    }
  }
  const route=zigzag ? automatic?[start,c1,c2,end]: horizontal
    ? [start,{x:c1.x,y:start.y},{x:c1.x,y:(c1.y+c2.y)/2},{x:c2.x,y:(c1.y+c2.y)/2},{x:c2.x,y:end.y},end]
    : [start,{x:start.x,y:c1.y},{x:(c1.x+c2.x)/2,y:c1.y},{x:(c1.x+c2.x)/2,y:c2.y},{x:end.x,y:c2.y},end]
    : undefined;
  const label = straight ? { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
    : route ? routeMidpoint(route)
    : angled ? { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 }
      : { x: (start.x + 3 * c1.x + 3 * c2.x + end.x) / 8,
        y: (start.y + 3 * c1.y + 3 * c2.y + end.y) / 8 };
  const path = straight ? `M${start.x},${start.y} L${end.x},${end.y}`
    : route ? route.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(" ")
    : angled ? `M${start.x},${start.y} L${c1.x},${c1.y} L${c2.x},${c2.y} L${end.x},${end.y}`
      : `M${start.x},${start.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${end.x},${end.y}`;
  const pattern = properties["line-pattern"] ?? "dash";
  const dash = pattern === "solid" ? undefined : pattern === "dot" ? "1 4"
    : pattern === "dash-dot" ? "6 3 1 3" : "6 4";
  return { start, end, c1, c2, label, path, dash, properties, straight, route,
    color: properties["line-color"] ?? "#348C83",
    width: Math.max(0.5, numeric(properties["line-width"], 1.5)),
    fontSize: Math.max(9, numeric(properties["fo:font-size"], 12)),
    beginArrow: properties["arrow-begin-class"] ?? "none",
    endArrow: properties["arrow-end-class"] ?? "org.xmind.arrowShape.herringbone",
    unsupportedPolar: [controls?.[0],controls?.[1]].some(p=>p && typeof p==='object' && ('amount' in p || 'angle' in p) && !polar(p) && !cartesian(p)),
  };
}
