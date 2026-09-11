/** Paths for fields captured from the native Xmind advanced shape palette. */
export const ADVANCED_SHAPES = [
  'heart.compact', 'simpleCloud.compact', 'star.compact', 'waterdrop.compact',
  'cutdiamond.compact', 'shield.compact', 'fatLeftArrow.compact', 'fatRightArrow.compact',
  'label.compact', 'bookmark.compact', 'singlebreakangle', 'stack', 'card',
] as const;
export const FLOWCHART_SHAPES = [
  'decision.compact','manualInput','predefinedProcess','manualOperation','database','document',
  'multiDocument','delay','data','onPageReference','offPageReference','circle.double','flag',
  'trapezoid','trapezoid.inverse',
] as const;
export function referenceSymbol(shape: string): 'on' | 'off' | undefined {
  const name=shape.replace(/^org\.xmind\.topicShape\./,'').toLowerCase();
  return name==='onpagereference'?'on':name==='offpagereference'?'off':undefined;
}
// Separate horizontal/vertical insets keep flowchart shapes compact while
// reserving their sloping edges, page waves and internal decoration lines.
const flowContent:Record<string,[number,number,number,number]>={
  'decision.compact':[.5,.5,2,2], manualinput:[.5,.6,1,1/.8],
  predefinedprocess:[.5,.5,1/.74,1], manualoperation:[.5,.5,1/.6,1],
  database:[.5,.575,1,2], document:[.5,.35,1,1/.7],
  multidocument:[.4,.475,1/.8,1/.55], delay:[.4,.5,1/.8,1/.8],
  data:[.5,.5,1/.6,1], flag:[.625,.5,1/.75,1],
  trapezoid:[.5,.5,1/.6,1], 'trapezoid.inverse':[.5,.5,1/.6,1],
};
export function flowContentScale(shape: string): [number,number] | undefined {
  const value=flowContent[shape.replace(/^org\.xmind\.topicShape\./,'').toLowerCase()];
  return value ? [value[2]*1.01,value[3]*1.01] : undefined;
}
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
Object.assign(polygons, {
  'decision.compact':[[.5,0],[1,.5],[.5,1],[0,.5]],
  manualinput:[[0,.2],[1,0],[1,1],[0,1]],
  predefinedprocess:[[0,0],[1,0],[1,1],[0,1]],
  manualoperation:[[0,0],[1,0],[.8,1],[.2,1]],
  flag:[[.25,0],[1,0],[1,1],[.25,1],[0,.5]],
  trapezoid:[[.2,0],[.8,0],[1,1],[0,1]],
  'trapezoid.inverse':[[0,0],[1,0],[.8,1],[.2,1]],
});
Object.assign(definitions, {
  database:[['M',0,.15],['C',0,-.05,1,-.05,1,.15],['L',1,.85],['C',1,1.05,0,1.05,0,.85],['L',0,.15]],
  document:[['M',0,0],['L',1,0],['L',1,.8],['C',.67,.65,.33,1.1,0,1],['L',0,0]],
  multidocument:[['M',0,.2],['L',.8,.2],['L',.8,.8],['C',.54,.65,.26,1.1,0,1],['L',0,.2]],
  delay:[['M',0,0],['L',.5,0],['C',7/6,0,7/6,1,.5,1],['L',0,1]],
  data:[['M',.25,0],['L',.95,0],['C',1,0,1,.08,.98,.15],['L',.8,.9],['C',.78,.98,.76,1,.7,1],['L',.05,1],['C',0,1,0,.92,.02,.85],['L',.2,.1],['C',.22,.02,.23,0,.25,0]],
} satisfies Record<string,Segment[]>);
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
    : name==='card' ? `M${w*.02},${h*.15} V${h*.85}`
    : name==='predefinedprocess' ? `M${w*.12},0 V${h} M${w*.88},0 V${h}`
    : name==='database' ? `M0,${h*.15} C0,${h*.35} ${w},${h*.35} ${w},${h*.15}` : undefined;
  const back=name==='stack' ? `M${w*.1},${h*.1} H${w} V${h} H${w*.1} Z` : name==='multidocument' ? `M${w*.1},${h*.1} H${w*.9} V${h*.7} M${w*.2},0 H${w} V${h*.6}` : undefined;
  if(name==='stack') outline.splice(0,outline.length,...([
    [0,0],[.9,0],[.9,.1],[1,.1],[1,1],[.1,1],[.1,.9],[0,.9],
  ] as Point[]).map(([x,y])=>[x*w,y*h] as Point));
  if(name==='multidocument') outline.splice(0,3,...([
    [0,.2],[.1,.2],[.1,.1],[.2,.1],[.2,0],[1,0],[1,.6],[.9,.6],[.9,.7],[.8,.7],[.8,.8],
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
  if(flowContent[name])return [flowContent[name][0],flowContent[name][1]];
  if(name==='fatleftarrow.compact')return [.7,.5];
  if(name==='fatrightarrow.compact')return [.3,.5];
  if(name==='label.compact')return [.4,.5];
  if(name==='bookmark.compact')return [.65,.5];
  if(name==='simplecloud.compact')return [.5,.62];
  if(name==='stack')return [.45,.45];
  return [.5,.5];
}
export function advancedShapeScale(name: string): number | undefined {
  if(contentScales.has(name))return contentScales.get(name)!;
  const geometry=advancedShape(name,1,1);
  if(!geometry)return undefined;
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
