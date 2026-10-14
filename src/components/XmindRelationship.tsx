import { arrowDrawing, arrowName } from "../lib/xmind/arrows";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ContextMenu from "./ContextMenu";
import type { Command, Relationship, Sheet } from "../lib/xmind/document";
import type { Box, Measure, SceneNode } from "../lib/xmind/scene";
import { draftBox } from "../lib/xmind/draft";
import { movedRelationshipControl, relationshipDropTarget, relationshipGeometry, type Point, type RelationshipControl } from "../lib/xmind/relationship";
import { useT } from "../lib/i18n";
import { moveOrthogonalSegment, type OrthogonalSegment } from "../lib/xmind/flexibleRelationship";

function Arrow({ id, kind, color, begin = false }: { id: string; kind: string; color: string; begin?: boolean }) {
  const shape=arrowName(kind),drawing=arrowDrawing(kind);
  if(shape==='none')return null;
  return <marker id={id} viewBox="-3 -3 10 6" refX={drawing!.anchor} refY={0}
    markerUnits="strokeWidth" markerWidth={10} markerHeight={6} orient="auto-start-reverse" overflow="visible">
    <path d={drawing!.path} transform={begin && shape==='hook' ? 'scale(1 -1)' : undefined}
      fill={drawing!.filled?color:'none'} stroke={drawing!.filled?'none':color} strokeWidth={1} />
  </marker>;
}

interface Props {
  relation: Relationship;
  sheet: Sheet;
  from: SceneNode;
  to: SceneNode;
  nodes: readonly SceneNode[];
  selected: boolean;
  readonly: boolean;
  markerPrefix: string;
  onSelect: () => void;
  onCommand: (command: Command) => void;
  toWorld: (x: number, y: number) => Point;
  viewport: Box;
  zoom: number;
  measure: Measure;
  registerFlush: (flush: (() => void) | null) => void;
}
export default function XmindRelationship(props: Props) {
  const { relation, sheet, from, to, selected, readonly, onCommand } = props;
  const t = useT();
  const [preview, setPreview] = useState<Record<string, RelationshipControl> | null>(null);
  const [flexiblePreview,setFlexiblePreview]=useState<Point[]|null>(null);
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState("");
  const dragging = useRef<{ index: number; moved: boolean } | null>(null);
  const insertion = useRef<{index:number; base:(Point & Record<string,unknown>)[]; moved:boolean;segment?:OrthogonalSegment}|null>(null);
  const [controlMenu,setControlMenu]=useState<{x:number;y:number;index:number}|null>(null);
  const endpointDrag = useRef<{end:0|1; moved:boolean}|null>(null);
  const [endpointPreview,setEndpointPreview]=useState<{end:0|1;target:SceneNode}|null>(null);
  const cancelled = useRef(false);
  const group = useRef<SVGGElement>(null);
  const focusCanvas = () => (group.current?.closest(".xm-canvas") as HTMLElement | null)?.focus();
  const displayedRelation=flexiblePreview?{...relation,flexibleControlPoints:flexiblePreview}:relation;
  const geometry = relationshipGeometry(sheet, preview ? { ...displayedRelation, controlPoints: {
    ...(relation.controlPoints as object ?? {}), ...preview,
  } } : displayedRelation, endpointPreview?.end===0?endpointPreview.target:from, endpointPreview?.end===1?endpointPreview.target:to);
  const { start, end, c1, c2, label, path, color, width, properties } = geometry;
  const editor = editing ? draftBox({ ...from, x: label.x - 100, y: label.y - 18, width: 200, height: 36,
    content: { x: 0, y: 0, width: 200, height: 36 }, imageHeight: 0, fontSize: geometry.fontSize, properties },
    draft, props.viewport, props.zoom, props.measure) : null;
  const id = `${props.markerPrefix}-${relation.id.replace(/[^a-zA-Z0-9]/g, "")}`;
  const commit = useCallback(() => {
    if (editing && !cancelled.current) {
      onCommand({ type: "relationship-update", id: relation.id, title: draft });
      setEditing(false);
    }
  }, [editing, draft, relation.id, onCommand]);
  const commitRef = useRef(commit); commitRef.current = commit;
  useEffect(() => {
    if (!editing) return;
    props.registerFlush(() => commitRef.current());
    return () => props.registerFlush(null);
  }, [editing, props.registerFlush]);
  const cancelDrag = () => { dragging.current = null; insertion.current=null; endpointDrag.current=null; setEndpointPreview(null); setPreview(null); setFlexiblePreview(null); };
  useEffect(()=>{if(!selected||readonly)setControlMenu(null);},[selected,readonly]);
  const savedFlexible = () => geometry.flexibleControls!.map((point,index)=> {
    const stored=Array.isArray(relation.flexibleControlPoints)?relation.flexibleControlPoints[index]:undefined;
    return stored && Number.isFinite(stored.x)&&Number.isFinite(stored.y)?{...stored}
      :{x:point.x-from.x-from.width/2,y:point.y-from.y-from.height/2};
  });
  const insertedControls = (point:Point) => {
    const {base,index,segment}=insertion.current!;
    if(segment)return moveOrthogonalSegment(base,segment,point).slice(2,-2).map(p=>({...p,
      x:p.x-from.x-from.width/2,y:p.y-from.y-from.height/2}));
    const next=[...base];
    next.splice(index,0,{x:point.x-from.x-from.width/2,y:point.y-from.y-from.height/2});
    return next;
  };
  useEffect(() => {
    const cancel = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape" && !e.isComposing && e.keyCode !== 229) cancelDrag(); };
    window.addEventListener("keydown", cancel);
    window.addEventListener("blur", cancelDrag);
    return () => { window.removeEventListener("keydown", cancel); window.removeEventListener("blur", cancelDrag); };
  }, []);
  const edit = useCallback(() => {
    if (readonly) return;
    cancelled.current = false;
    setDraft(relation.title ?? ""); setEditing(true);
  }, [readonly,relation.title]);
  useEffect(() => {
    if (!selected || readonly) return;
    const canvas=group.current?.closest('.xm-canvas');
    const rename=(event:Event) => {
      const e=event as globalThis.KeyboardEvent;
      if(e.isComposing || e.keyCode===229 || e.metaKey || e.ctrlKey || e.altKey ||
        (e.target as Element).closest('input,textarea,select,button,[contenteditable="true"]')) return;
      if(e.key==='F2' || e.key===' ') {
        e.preventDefault();e.stopPropagation();edit();
      }
    };
    canvas?.addEventListener('keydown',rename,true);
    return ()=>canvas?.removeEventListener('keydown',rename,true);
  }, [selected,readonly,edit]);
  const markerStart = geometry.beginArrow.endsWith("none") ? undefined : `url(#${id}-start)`;
  const markerEnd = geometry.endArrow.endsWith("none") ? undefined : `url(#${id}-end)`;
  return <g ref={group} data-relationship={relation.id} role={editing ? "group" : "button"} tabIndex={editing ? undefined : 0} aria-pressed={editing ? undefined : selected} aria-label={relation.title || t("xmind.relationship")}
    onClick={e => {
      if ((e.target as Element).closest("input,textarea")) return;
      e.stopPropagation(); props.onSelect(); focusCanvas();
    }}
    onKeyDown={e => {
      if (e.target !== e.currentTarget || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault(); e.stopPropagation(); props.onSelect(); focusCanvas();
      }
    }}
    onPointerDown={(e) => {
      e.stopPropagation();
      if ((e.target as Element).closest("input,textarea")) return;
      (e.currentTarget.closest(".xm-canvas") as HTMLElement)?.focus();
      props.onSelect();
    }}
    onDoubleClick={(e) => { e.stopPropagation(); if (!(e.target as Element).closest("[data-control],[data-endpoint]")) edit(); }}>
    <defs><Arrow id={`${id}-start`} kind={geometry.beginArrow} color={color} begin />
      <Arrow id={`${id}-end`} kind={geometry.endArrow} color={color} /></defs>
    {selected && <path d={path} fill="none" stroke="#80CFFF" strokeWidth={width + 6} opacity={0.55} pointerEvents="none" />}
    <path d={path} data-relationship-path fill="none" stroke={color} strokeWidth={width}
      strokeDasharray={geometry.dash} markerStart={markerStart} markerEnd={markerEnd} />
    <path d={path} fill="none" stroke="transparent" strokeWidth={14 / props.zoom} style={{ cursor: "pointer" }} />
    {editing ? <foreignObject x={label.x - 100 + editor!.x} y={label.y - 18 + editor!.y} width={editor!.width} height={editor!.height}>
      <textarea autoFocus rows={1} aria-label={t("xmind.editRelationship")} value={draft}
        style={{width:"100%",height:"100%",boxSizing:"border-box",fontSize:editor!.fontSize,padding:editor!.padding,
          resize:"none",lineHeight:1.4,overflow:"auto",
          fontFamily:properties["fo:font-family"],fontWeight:properties["fo:font-weight"]}}
        className="deditor-input" onFocus={(e) => e.target.select()}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") return;
          e.stopPropagation(); if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); focusCanvas(); }
          if (e.key === "Escape") { e.preventDefault(); cancelled.current = true; setEditing(false); focusCanvas(); }
        }} />
    </foreignObject> : relation.title ? <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="central"
      paintOrder="stroke" stroke={sheet.style?.properties?.["svg:fill"] ?? sheet.theme?.map?.properties?.["svg:fill"] ?? "#fff"} strokeWidth={6} strokeLinejoin="round"
      fill={geometry.textColor} fontSize={geometry.fontSize}
      fontFamily={properties["fo:font-family"] ?? "NeverMind, PingFang SC, Microsoft YaHei, sans-serif"}
      fontWeight={properties["fo:font-weight"]} style={{ cursor: readonly ? "pointer" : "text", whiteSpace:"pre" }}>
      {geometry.labelLines.map((line,index)=><tspan key={index} x={label.x}
        y={label.y+(index-(geometry.labelLines.length-1)/2)*geometry.labelLineHeight}>{line || "\u00a0"}</tspan>)}
    </text> : null}
    {selected && !readonly && !editing && geometry.virtualControls?.map((point,index)=><circle key={`virtual-${index}`}
      cx={point.x} cy={point.y} r={5/props.zoom} fill="#fff" fillOpacity={0.8} stroke="#299AD8"
      strokeWidth={1.5/props.zoom} strokeDasharray={`${2/props.zoom} ${2/props.zoom}`} data-virtual-control={index}
      aria-label={t(point.segment?'xmind.moveRelationshipSegment':'xmind.addControlPoint',{index:index+1})}
      style={{cursor:point.segment?(point.segment.axis==='x'?'ew-resize':'ns-resize'):'move'}}
      onDoubleClick={e=>e.stopPropagation()}
      onPointerDown={e=>{
        if(e.button!==0)return;
        const saved=savedFlexible();
        const base=point.segment?geometry.route!.map(p=>{
          const control=geometry.flexibleControls!.findIndex(c=>Math.hypot(c.x-p.x,c.y-p.y)<1e-7);
          return {...(control<0?{}:saved[control]),...p};
        }):saved;
        insertion.current={index,base,moved:false,segment:point.segment};
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={e=>{
        if(!insertion.current)return;
        insertion.current.moved=true;
        setFlexiblePreview(insertedControls(props.toWorld(e.clientX,e.clientY)));
      }}
      onPointerUp={e=>{
        if(!insertion.current)return;
        if(insertion.current.moved)onCommand({type:'relationship-update',id:relation.id,
          flexibleControlPoints:insertedControls(props.toWorld(e.clientX,e.clientY))});
        cancelDrag();
      }} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag} />)}
    {selected && !readonly && !editing && !geometry.straight && (geometry.flexibleControls??[c1,c2]).map((point, index) => {
      const isFlexible=!!geometry.flexibleControls;
      const anchor = index ? end : start, topic = isFlexible?from:index ? to : from;
      const movedControl = (point:Point) => movedRelationshipControl(
        (relation.controlPoints as Record<string,unknown> | undefined)?.[index],point,topic,anchor,index?start:end);
      const movedFlexible = (point:Point) => geometry.flexibleControls!.map((p,i)=> {
        const stored=Array.isArray(relation.flexibleControlPoints)?relation.flexibleControlPoints[i]:undefined;
        // Do not round-trip untouched vectors through world coordinates: even
        // floating-point noise would needlessly change unrelated archive data.
        if(i!==index && stored && Number.isFinite(stored.x)&&Number.isFinite(stored.y))return {...stored};
        return {...stored,x:(i===index?point.x:p.x)-from.x-from.width/2,y:(i===index?point.y:p.y)-from.y-from.height/2};
      });
      return <g key={index}>
        {!isFlexible && <path d={`M${anchor.x},${anchor.y} L${point.x},${point.y}`} stroke="#55B7E8" strokeWidth={1} pointerEvents="none" />}
        <circle cx={point.x} cy={point.y} r={6 / props.zoom} fill="#fff" stroke="#299AD8" strokeWidth={2 / props.zoom}
          data-control={index} aria-label={t("xmind.controlPoint", { index: index + 1 })}
          style={{ cursor: "move" }}
          onContextMenu={isFlexible?e=>{
            e.preventDefault();e.stopPropagation();setControlMenu({x:e.clientX,y:e.clientY,index});
          }:undefined}
          onDoubleClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            dragging.current = { index, moved: false };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!dragging.current) return;
            dragging.current.moved = true;
            const p = props.toWorld(e.clientX, e.clientY);
            if(isFlexible)setFlexiblePreview(movedFlexible(p));
            else setPreview({ [index]: movedControl(p) });
          }}
          onPointerUp={(e) => {
            if (!dragging.current) return;
            if (dragging.current.moved) {
              const p = props.toWorld(e.clientX, e.clientY);
              onCommand({ type: "relationship-update", id: relation.id,
                ...(isFlexible?{flexibleControlPoints:movedFlexible(p)}:{controlPoints: { [index]: movedControl(p) }}) });
            }
            cancelDrag();
          }}
          onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag} />
      </g>;
    })}
    {controlMenu && selected && !readonly && createPortal(<ContextMenu x={controlMenu.x} y={controlMenu.y}
      onClose={()=>setControlMenu(null)} items={[{label:t('xmind.removeControlPoint'),
        disabled:(geometry.flexibleControls?.length??0)<=1,
        onClick:()=>onCommand({type:'relationship-update',id:relation.id,
          flexibleControlPoints:savedFlexible().filter((_,index)=>index!==controlMenu.index)})}]} />,document.body)}
    {endpointPreview && <rect x={endpointPreview.target.x-3} y={endpointPreview.target.y-3}
      width={endpointPreview.target.width+6} height={endpointPreview.target.height+6}
      rx={6} fill="none" stroke="#299AD8" strokeWidth={2} pointerEvents="none" />}
    {selected && !readonly && !editing && ([start,end] as const).map((point,index)=> {
      const endpoint=index as 0|1,other=index===0?to.topic.id:from.topic.id;
      return <circle key={`endpoint-${index}`} cx={point.x} cy={point.y} r={6 / props.zoom}
        fill="#299AD8" stroke="#fff" strokeWidth={2 / props.zoom} data-endpoint={index}
        aria-label={t('xmind.endpoint',{index:index+1})} style={{cursor:'crosshair'}}
        onDoubleClick={e=>e.stopPropagation()}
        onPointerDown={e=>{
          if(e.button!==0)return;
          endpointDrag.current={end:endpoint,moved:false};
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e=>{
          if(!endpointDrag.current)return;
          endpointDrag.current.moved=true;
          const target=relationshipDropTarget(props.nodes,props.toWorld(e.clientX,e.clientY),other);
          setEndpointPreview(target?{end:endpoint,target}:null);
        }}
        onPointerUp={e=>{
          if(!endpointDrag.current)return;
          const target=relationshipDropTarget(props.nodes,props.toWorld(e.clientX,e.clientY),other);
          if(endpointDrag.current.moved&&target)onCommand({type:'relationship-reconnect',id:relation.id,end:endpoint,topicId:target.topic.id});
          cancelDrag();
        }}
        onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag} />;
    })}
  </g>;
}
