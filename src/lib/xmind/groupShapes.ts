export const SUMMARY_SHAPES = ['angle', 'square', 'round', 'curly', 'straight'] as const;
export const BOUNDARY_SHAPES = ['roundedRect', 'rect', 'polygon', 'roundedPolygon', 'scallops', 'waves', 'tension', 'focus', 'cross'] as const;
type Box = { x: number; y: number; width: number; height: number };
type Point = [number, number];

export function boundaryHidesTitle(shape?: string): boolean {
  const name=shape?.split('.').pop()?.toLowerCase();
  return name==='polygon' || name==='roundedpolygon';
}

export function boundaryOverflow(shape?: string): number {
  const name = shape?.split('.').pop()?.toLowerCase();
  return name === 'cross' ? 10 : name === 'scallops' || name === 'waves' ? 5 : 0;
}

function hull(points: Point[]): Point[] {
  const sorted = points.sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
  const cross = (a: Point,b: Point,c: Point) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const half = (values: Point[]) => {
    const chain: Point[]=[];
    for(const point of values) {
      while(chain.length>1 && cross(chain[chain.length-2],chain[chain.length-1],point)<=0) chain.pop();
      chain.push(point);
    }
    return chain.slice(0,-1);
  };
  return [...half(sorted),...half([...sorted].reverse())];
}

function polygonPath(points: Point[], rounded: boolean): string {
  if (!points.length) return '';
  if (!rounded) return `M${points[0]} ${points.slice(1).map(p=>`L${p}`).join(' ')} Z`;
  const corners=points.map((p,i)=> {
    const before=points[(i+points.length-1)%points.length], after=points[(i+1)%points.length];
    const along=(other: Point): Point => {
      const distance=Math.hypot(other[0]-p[0],other[1]-p[1]);
      const ratio=distance ? Math.min(14,distance/2)/distance : 0;
      return [p[0]+(other[0]-p[0])*ratio,p[1]+(other[1]-p[1])*ratio];
    };
    return {p,enter:along(before),exit:along(after)};
  });
  return `M${corners[0].enter} ${corners.map(c=>`L${c.enter} Q${c.p} ${c.exit}`).join(' ')} Z`;
}

/** Independent fill and border paths support open-corner and extended-line frames. */
export function boundaryGeometry(shape: string | undefined, width: number, height: number, members: readonly Box[] = [], padding=14, direction: 'left'|'right'|'up'|'down'='right'): {fillPath: string; borderPath: string} | null {
  const name=shape?.split('.').pop()?.toLowerCase();
  const w=Math.max(0,width),h=Math.max(0,height),rect=`M0,0 H${w} V${h} H0 Z`;
  if(name==='focus') {
    const arm=Math.min(60,w/8,h/8);
    return {fillPath:rect,borderPath:`M0,${arm} V0 H${arm} M${w-arm},0 H${w} V${arm} M${w},${h-arm} V${h} H${w-arm} M${arm},${h} H0 V${h-arm}`};
  }
  if(name==='cross') return {fillPath:rect,borderPath:`M-10,0 H${w+10} M${w},-10 V${h+10} M${w+10},${h} H-10 M0,${h+10} V-10`};
  if(name==='polygon' || name==='roundedpolygon') {
    const points: Point[]=members.flatMap(b=> {
      const x=Math.max(0,b.x-padding),y=Math.max(0,b.y-padding),r=Math.min(w,b.x+b.width+padding),bottom=Math.min(h,b.y+b.height+padding);
      return (direction==='left' ? [[r,y],[r,bottom]] : direction==='up' ? [[x,bottom],[r,bottom]] : direction==='down' ? [[x,y],[r,y]] : [[x,y],[x,bottom]]) as Point[];
    });
    if(points.length) points.push(...(direction==='left'?[[0,0],[0,h]]:direction==='up'?[[0,0],[w,0]]:direction==='down'?[[0,h],[w,h]]:[[w,0],[w,h]]) as Point[]);
    const path=polygonPath(points.length ? hull(points) : [[0,0],[w,0],[w,h],[0,h]],name==='roundedpolygon');
    return {fillPath:path,borderPath:path};
  }
  if(name==='scallops' || name==='waves' || name==='tension') {
    const corners: Point[]=[[0,0],[w,0],[w,h],[0,h]];
    let path='M0,0';
    corners.forEach((start,i)=> {
      const end=corners[(i+1)%4],dx=end[0]-start[0],dy=end[1]-start[1],length=Math.hypot(dx,dy);
      const count=Math.max(1,Math.floor(length/40));
      const point=(fraction: number,out: number): Point => [start[0]+dx*fraction+(length?dy/length*out:0),start[1]+dy*fraction-(length?dx/length*out:0)];
      for(let step=0;step<count;step++) {
        const a=step/count,b=(step+1)/count,amplitude=name==='tension'?-5:5;
        if(name==='waves') path+=` Q${point(a+(b-a)/4,2.5)} ${point((a+b)/2,0)} Q${point(a+(b-a)*3/4,-2.5)} ${point(b,0)}`;
        else if(name==='tension') path+=` Q${point((a+b)/2,-5)} ${point(b,0)}`;
        else path+=` C${point(a+(b-a)/4,amplitude)} ${point(a+(b-a)*3/4,amplitude)} ${point(b,0)}`;
      }
    });
    path+=' Z';
    return {fillPath:path,borderPath:path};
  }
  return null;
}

/** Local coordinates: members are to the left, summary topic to the right. */
export function summaryPath(shape: string | undefined, length: number): string {
  const name = shape?.split('.').pop()?.toLowerCase() ?? 'curly';
  const h = Math.max(0, length), mid = h / 2;
  if (name === 'angle') return `M0,0 L30,${mid} L0,${h}`;
  if (name === 'square') return `M0,0 H15 V${h} H0 M15,${mid} H30`;
  if (name === 'straight') return `M15,0 V${h} M15,${mid} H30`;
  if (name === 'round') return `M0,0 Q20,0 20,${mid} Q20,${h} 0,${h} M20,${mid} H30`;
  const neck = Math.min(10, mid);
  return `M0,0 C18,0 18,0 18,${mid-neck} Q18,${mid} 30,${mid} Q18,${mid} 18,${mid+neck} C18,${h} 18,${h} 0,${h}`;
}
