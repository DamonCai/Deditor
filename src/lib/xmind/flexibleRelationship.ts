import type { Point } from './relationship';

const distance=(a:Point,b:Point)=>Math.hypot(b.x-a.x,b.y-a.y);
const middle=(a:Point,b:Point):Point=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const unique=(points:Point[])=>points.filter((p,i)=>!i||distance(p,points[i-1])>1e-7);
export interface OrthogonalSegment { start:number; end:number; axis:'x'|'y' }
export type VirtualControl = Point & {segment?:OrthogonalSegment};

function segmentHandles(route:Point[]):VirtualControl[] {
  const handles:VirtualControl[]=[];
  for(let start=1;start<route.length-2;) {
    const a=route[start],b=route[start+1];
    if(distance(a,b)<1e-7){start++;continue;}
    const axis=Math.abs(a.x-b.x)<1e-7?'x':'y';
    let end=start+1;
    while(end<route.length-2&&Math.abs(route[end+1][axis]-a[axis])<1e-7)end++;
    handles.push({...middle(a,route[end]),segment:{start,end,axis}});
    start=end;
  }
  return handles;
}

/** Shift a whole orthogonal run while retaining both fixed endpoint stubs. */
export function moveOrthogonalSegment<T extends Point>(route:T[],segment:OrthogonalSegment,point:Point):T[] {
  const {start,end,axis}=segment;
  const next=route.map((p,index)=>index>=start&&index<=end?{...p,[axis]:point[axis]}:{...p});
  if(end===route.length-2)next.splice(end+1,0,{...route[end]});
  if(start===1)next.splice(1,0,{...route[1]});
  return next;
}

function midpoint(points:Point[]):Point {
  let remaining=points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0)/2;
  for(let i=1;i<points.length;i++) {
    const length=distance(points[i-1],points[i]);
    if(length && remaining<=length) {
      const t=remaining/length,a=points[i-1],b=points[i];
      return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
    }
    remaining-=length;
  }
  return points[0];
}

/** Natural cubic spline, parameterized by chord length. Duplicate knots are removed. */
function spline(points:Point[]) {
  const count=points.length,h=points.slice(1).map((p,i)=>distance(points[i],p));
  const second=(axis:'x'|'y') => {
    const diagonal=new Array(count).fill(1),upper=new Array(count).fill(0),rhs=new Array(count).fill(0);
    for(let i=1;i<count-1;i++) {
      diagonal[i]=2*(h[i-1]+h[i]);upper[i]=h[i];
      rhs[i]=6*((points[i+1][axis]-points[i][axis])/h[i]-(points[i][axis]-points[i-1][axis])/h[i-1]);
      const multiplier=h[i-1]/diagonal[i-1];
      diagonal[i]-=multiplier*upper[i-1];rhs[i]-=multiplier*rhs[i-1];
    }
    const result=new Array(count).fill(0);
    for(let i=count-2;i>0;i--)result[i]=(rhs[i]-upper[i]*result[i+1])/diagonal[i];
    return result;
  };
  const mx=second('x'),my=second('y');
  return h.map((length,i)=> {
    const a=points[i],b=points[i+1];
    const controls=(axis:'x'|'y',m:number[])=> {
      const slope=(b[axis]-a[axis])/length;
      return [a[axis]+length/3*(slope-length*(2*m[i]+m[i+1])/6),
        b[axis]-length/3*(slope+length*(m[i]+2*m[i+1])/6)];
    };
    const x=controls('x',mx),y=controls('y',my);
    return {a,b,c1:{x:x[0],y:y[0]},c2:{x:x[1],y:y[1]}};
  });
}

export function flexibleRelationshipRoute(shape:string,start:Point,end:Point,controls:Point[],sourceCenter:Point,targetCenter:Point) {
  const curved=shape.endsWith('.curved'),zigzag=shape.endsWith('.zigzag');
  const extend=(point:Point,center:Point):Point=> {
    const dx=point.x-center.x,dy=point.y-center.y,reach=zigzag?30:15;
    return Math.abs(dx)>=Math.abs(dy)?{x:point.x+Math.sign(dx||1)*reach,y:point.y}
      :{x:point.x,y:point.y+Math.sign(dy||1)*reach};
  };
  const knots=unique(curved||zigzag?[start,extend(start,sourceCenter),...controls,extend(end,targetCenter),end]:[start,...controls,end]);
  if(curved) {
    const segments=spline(knots),samples:Point[]=[start];
    for(const {a,b,c1,c2} of segments)for(let i=1;i<=24;i++) {
      const t=i/24,u=1-t;
      samples.push({x:u**3*a.x+3*u*u*t*c1.x+3*u*t*t*c2.x+t**3*b.x,
        y:u**3*a.y+3*u*u*t*c1.y+3*u*t*t*c2.y+t**3*b.y});
    }
    return {path:`M${start.x},${start.y} `+segments.map(s=>`C${s.c1.x},${s.c1.y} ${s.c2.x},${s.c2.y} ${s.b.x},${s.b.y}`).join(' '),
      label:midpoint(samples),bounds:segments.flatMap(s=>[s.a,s.c1,s.c2,s.b]),route:undefined,
      virtualControls:(knots.length===controls.length+4?segments.slice(1,-1).map(({a,b,c1,c2})=>({
        x:(a.x+3*c1.x+3*c2.x+b.x)/8,y:(a.y+3*c1.y+3*c2.y+b.y)/8,
      })):[]) as VirtualControl[]};
  }
  // Keep the cheapest route for each incoming direction. Looking across knots
  // avoids choosing an elbow that immediately doubles back at the next knot.
  const interiorWaypoints=new Set(controls.slice(1,-1));
  // Retain shared prefixes and reconstruct once. Copying the complete prefix
  // for every candidate makes each pointer move quadratic in the knot count.
  interface Candidate { previous:Candidate|null; steps:Point[]; cost:number; direction:string }
  let candidates:Candidate[]=[{previous:null,steps:[knots[0]],cost:0,direction:''}];
  for(const target of knots.slice(1)) {
    const next=new Map<string,typeof candidates[number]>();
    for(const candidate of candidates) {
      const last=candidate.steps[candidate.steps.length-1];
      const diagonal=Math.abs(last.x-target.x)>1e-7&&Math.abs(last.y-target.y)>1e-7;
      const mid=middle(last,target);
      const choices=zigzag&&diagonal?[
        [{x:target.x,y:last.y},target],[{x:last.x,y:target.y},target],
        [{x:mid.x,y:last.y},{x:mid.x,y:target.y},target],
        [{x:last.x,y:mid.y},{x:target.x,y:mid.y},target],
      ]:[[target]];
      for(const steps of choices) {
        let cost=candidate.cost,direction=candidate.direction,previous=last;
        for(const p of steps) {
          const d=p.x>previous.x?'right':p.x<previous.x?'left':p.y>previous.y?'down':'up';
          const reverse=({right:'left',left:'right',up:'down',down:'up'} as Record<string,string>)[direction]===d;
          cost+=distance(previous,p)+(reverse?10000:direction&&direction!==d?1:0);
          // Equal-length routes should continue through an interior waypoint
          // instead of forcing a bend exactly at that saved point.
          if(previous===last && direction && direction!==d && interiorWaypoints.has(last))cost+=0.01;
          direction=d;previous=p;
        }
        if(!next.has(direction)||cost<next.get(direction)!.cost)next.set(direction,{previous:candidate,steps,cost,direction});
      }
    }
    candidates=[...next.values()];
  }
  const chunks:Point[][]=[];
  for(let candidate:Candidate|null=candidates.sort((a,b)=>a.cost-b.cost)[0];candidate;candidate=candidate.previous)chunks.push(candidate.steps);
  const route=chunks.reverse().flat();
  return {path:route.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' '),label:midpoint(route),bounds:route,route,
    virtualControls:zigzag?segmentHandles(route):[start,...controls].map((p,i)=>middle(p,controls[i]??end)) as VirtualControl[]};
}

export const defaultFlexibleControls=(start:Point,end:Point):Point[]=>[middle(start,end)];
