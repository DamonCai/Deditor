/** Paths for fields captured from the native Xmind advanced shape palette. */
export const ADVANCED_SHAPES = [
  'heart.compact', 'simpleCloud.compact', 'star.compact', 'waterdrop.compact',
  'cutdiamond.compact', 'shield.compact', 'fatLeftArrow.compact', 'fatRightArrow.compact',
  'label.compact', 'bookmark.compact', 'singlebreakangle', 'stack', 'card',
] as const;
type Point = [number, number];
type Segment = ['M' | 'L', number, number] | ['C', number, number, number, number, number, number];

const definitions: Record<string, Segment[]> = {
  'heart.compact': [['M',.5,1],['C',.4,.88,0,.61,0,.28],['C',0,-.05,.36,-.08,.5,.22],['C',.64,-.08,1,-.05,1,.28],['C',1,.61,.6,.88,.5,1]],
  'simplecloud.compact': [['M',.22,1],['C',-.06,1,-.06,.42,.18,.42],
    ['C',.22,-.14,.76,-.14,.82,.42],['C',1.06,.42,1.06,1,.78,1],['L',.22,1]],
  'waterdrop.compact': [['M',1,0],['L',1,.5],['C',1,7/6,0,7/6,0,.5],['C',0,.22,.22,0,.5,0],['L',1,0]],
  'shield.compact': [['M',.5,0],['C',.36,.08,.15,.13,0,.16],['C',0,.76,.17,.89,.5,1],['C',.83,.89,1,.76,1,.16],['C',.85,.13,.64,.08,.5,0]],
};
const polygons: Record<string, Point[]> = {
  'cutdiamond.compact': [[.25,0],[.75,0],[1,.25],[.5,1],[0,.25]],
  'fatrightarrow.compact': [[0,.25],[.6,.25],[.6,0],[1,.5],[.6,1],[.6,.75],[0,.75]],
  'fatleftarrow.compact': [[1,.25],[.4,.25],[.4,0],[0,.5],[.4,1],[.4,.75],[1,.75]],
  'label.compact': [[0,0],[.75,0],[1,.5],[.75,1],[0,1]],
  'bookmark.compact': [[0,0],[1,0],[1,1],[0,1],[.25,.5]],
  singlebreakangle: [[0,0],[.75,0],[1,.25],[1,1],[0,1]],
};
polygons['star.compact'] = Array.from({length:10},(_,i) => {
  const angle=-Math.PI/2+i*Math.PI/5, radius=i%2?.22:.5;
  return [.5+radius*Math.cos(angle),.5+radius*Math.sin(angle)];
});

function roundedRect(left: number, top: number, right: number, bottom: number, r: number): Segment[] {
  return [['M',left+r,top],['L',right-r,top],['C',right,top,right,top,right,top+r],
    ['L',right,bottom-r],['C',right,bottom,right,bottom,right-r,bottom],
    ['L',left+r,bottom],['C',left,bottom,left,bottom,left,bottom-r],
    ['L',left,top+r],['C',left,top,left,top,left+r,top]];
}
definitions.card=roundedRect(0,0,1,1,.1);
definitions.stack=roundedRect(0,0,.9,.9,.08);

function segmentsOf(name: string): Segment[] | undefined {
  const polygon=polygons[name];
  return polygon ? polygon.map(([x,y],i)=>[i?'L':'M',x,y] as Segment) : definitions[name];
}

/** Sampling is shared by content containment and line/outline intersection. */
export function advancedShape(shape: string, w: number, h: number) {
  const name=shape.replace(/^org\.xmind\.topicShape\./,'').toLowerCase(), segments=segmentsOf(name);
  if(!segments) return undefined;
  const outline: Point[]=[];
  let previous: Point=[0,0];
  const path=segments.map(segment=>{
    const [kind,...values]=segment;
    const scaled=values.map((n,i)=>n*(i%2?h:w));
    if(kind==='C') {
      const [ax,ay,bx,by,x,y]=scaled;
      for(let i=1;i<=48;i++) {
        const t=i/48,u=1-t;
        outline.push([u**3*previous[0]+3*u*u*t*ax+3*u*t*t*bx+t**3*x,
          u**3*previous[1]+3*u*u*t*ay+3*u*t*t*by+t**3*y]);
      }
      previous=[x,y];
    } else {previous=[scaled[0],scaled[1]];outline.push(previous);}
    return kind+scaled.join(',');
  }).join(' ')+' Z';
  // Decorative lines are separate from the hit outline: arrows must not stop
  // on a fold or on the front page of the stack.
  const detail=name==='singlebreakangle' ? `M${w*.75},0 V${h*.25} H${w}`
    : name==='card' ? `M${w*.02},${h*.15} V${h*.85}` : undefined;
  const back=name==='stack' ? `M${w*.1},${h*.1} H${w} V${h} H${w*.1} Z` : undefined;
  if(name==='stack') outline.splice(0,outline.length,...([
    [0,0],[.9,0],[.9,.1],[1,.1],[1,1],[.1,1],[.1,.9],[0,.9],
  ] as Point[]).map(([x,y])=>[x*w,y*h] as Point));
  return {path,outline,detail,back};
}

export function pointInOutline([x,y]: Point, outline: Point[]): boolean {
  let inside=false;
  for(let i=0,j=outline.length-1;i<outline.length;j=i++) {
    const [ax,ay]=outline[i],[bx,by]=outline[j];
    if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax) inside=!inside;
  }
  return inside;
}
const contentScales=new Map<string,number>();
export function shapeContentCenter(shape: string): Point {
  const name=shape.replace(/^org\.xmind\.topicShape\./,'').toLowerCase();
  if(name==='fatleftarrow.compact')return [.7,.5];
  if(name==='fatrightarrow.compact')return [.3,.5];
  if(name==='label.compact')return [.4,.5];
  if(name==='bookmark.compact')return [.65,.5];
  if(name==='simplecloud.compact')return [.5,.62];
  if(name==='stack')return [.45,.45];
  return [.5,.5];
}
export function advancedShapeScale(name: string): number | undefined {
  const geometry=advancedShape(name,1,1);
  if(!geometry)return undefined;
  if(contentScales.has(name))return contentScales.get(name)!;
  const [cx,cy]=shapeContentCenter(name);
  // The nearest boundary in the L-infinity metric gives the largest centred
  // square entirely inside even a concave outline. Segment minima occur at an
  // endpoint or where the absolute x/y distances are equal.
  let radius=Infinity;
  for(const [i,p] of geometry.outline.entries()) {
    const q=geometry.outline[(i+1)%geometry.outline.length];
    const ax=p[0]-cx,ay=p[1]-cy,dx=q[0]-p[0],dy=q[1]-p[1];
    const candidates=[0,1,(ay-ax)/(dx-dy),(-ay-ax)/(dx+dy)];
    for(const t of candidates)if(Number.isFinite(t)&&t>=0&&t<=1)
      radius=Math.min(radius,Math.max(Math.abs(ax+dx*t),Math.abs(ay+dy*t)));
  }
  const scale=.5/radius*1.01;
  contentScales.set(name,scale);
  return scale;
}
