import { arrowDrawing, arrowName } from "../lib/xmind/arrows";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Command, Relationship, Sheet } from "../lib/xmind/document";
import type { Box, Measure, SceneNode } from "../lib/xmind/scene";
import { draftBox } from "../lib/xmind/draft";
import { relationshipDropTarget, relationshipGeometry, type Point } from "../lib/xmind/relationship";
import { useT } from "../lib/i18n";

function Arrow({ id, kind, color, begin = false }: { id: string; kind: string; color: string; begin?: boolean }) {
  const shape=arrowName(kind),drawing=arrowDrawing(kind);
  if(shape==='none')return null;
  return <marker id={id} viewBox="0 0 12 12" refX={11} refY={6} markerWidth={shape==='hook'?6:4.5} markerHeight={shape==='hook'?6:4.5} orient="auto-start-reverse">
    {shape==='dot' ? <circle cx={6} cy={6} r={5} fill={color} />
      : drawing && <path d={drawing.path} transform={begin && shape==='hook' ? 'translate(0 12) scale(1 -1)' : undefined} fill={drawing.filled?color:'none'} stroke={drawing.filled?'none':color} strokeWidth={1.5} />}
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
  const [preview, setPreview] = useState<Record<string, Point> | null>(null);
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState("");
  const dragging = useRef<{ index: number; moved: boolean } | null>(null);
  const endpointDrag = useRef<{end:0|1; moved:boolean}|null>(null);
  const [endpointPreview,setEndpointPreview]=useState<{end:0|1;target:SceneNode}|null>(null);
  const cancelled = useRef(false);
  const group = useRef<SVGGElement>(null);
  const focusCanvas = () => (group.current?.closest(".xm-canvas") as HTMLElement | null)?.focus();
  const geometry = relationshipGeometry(sheet, preview ? { ...relation, controlPoints: {
    ...(relation.controlPoints as object ?? {}), ...preview,
  } } : relation, endpointPreview?.end===0?endpointPreview.target:from, endpointPreview?.end===1?endpointPreview.target:to);
  const { start, end, c1, c2, label, path, color, width, properties } = geometry;
  const editor = editing ? draftBox({ ...from, x: label.x - 100, y: label.y - 18, width: 200, height: 36,
    content: { x: 0, y: 0, width: 200, height: 36 }, imageHeight: 0, fontSize: geometry.fontSize, properties },
    draft, props.viewport, props.zoom, props.measure, true) : null;
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
  const cancelDrag = () => { dragging.current = null; endpointDrag.current=null; setEndpointPreview(null); setPreview(null); };
  useEffect(() => {
    const cancel = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape" && !e.isComposing && e.keyCode !== 229) cancelDrag(); };
    window.addEventListener("keydown", cancel);
    window.addEventListener("blur", cancelDrag);
    return () => { window.removeEventListener("keydown", cancel); window.removeEventListener("blur", cancelDrag); };
  }, []);
  const edit = () => {
    if (readonly) return;
    cancelled.current = false;
    setDraft(relation.title ?? ""); setEditing(true);
  };
  const markerStart = geometry.beginArrow.endsWith("none") ? undefined : `url(#${id}-start)`;
  const markerEnd = geometry.endArrow.endsWith("none") ? undefined : `url(#${id}-end)`;
  return <g ref={group} data-relationship={relation.id} aria-label={relation.title || t("xmind.relationship")}
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
    <path d={path} fill="none" stroke="transparent" strokeWidth={14} style={{ cursor: "pointer" }} />
    {selected && !readonly && !geometry.straight && [c1, c2].map((point, index) => {
      const anchor = index ? end : start, topic = index ? to : from;
      return <g key={index}>
        <path d={`M${anchor.x},${anchor.y} L${point.x},${point.y}`} stroke="#55B7E8" strokeWidth={1} pointerEvents="none" />
        <circle cx={point.x} cy={point.y} r={6} fill="#fff" stroke="#299AD8" strokeWidth={2}
          data-control={index} aria-label={t("xmind.controlPoint", { index: index + 1 })}
          style={{ cursor: "move" }}
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
            setPreview({ [index]: { x: p.x - topic.x - topic.width / 2, y: p.y - topic.y - topic.height / 2 } });
          }}
          onPointerUp={(e) => {
            if (!dragging.current) return;
            if (dragging.current.moved) {
              const p = props.toWorld(e.clientX, e.clientY);
              onCommand({ type: "relationship-update", id: relation.id,
                controlPoints: { [index]: { x: p.x - topic.x - topic.width / 2, y: p.y - topic.y - topic.height / 2 } } });
            }
            cancelDrag();
          }}
          onPointerCancel={cancelDrag} />
      </g>;
    })}
    {endpointPreview && <rect x={endpointPreview.target.x-3} y={endpointPreview.target.y-3}
      width={endpointPreview.target.width+6} height={endpointPreview.target.height+6}
      rx={6} fill="none" stroke="#299AD8" strokeWidth={2} pointerEvents="none" />}
    {selected && !readonly && ([start,end] as const).map((point,index)=> {
      const endpoint=index as 0|1,other=index===0?to.topic.id:from.topic.id;
      return <circle key={`endpoint-${index}`} cx={point.x} cy={point.y} r={6}
        fill="#299AD8" stroke="#fff" strokeWidth={2} data-endpoint={index}
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
    {editing ? <foreignObject x={label.x - 100 + editor!.x} y={label.y - 18 + editor!.y} width={editor!.width} height={editor!.height}>
      <input autoFocus aria-label={t("xmind.editRelationship")} value={draft}
        style={{width:"100%",height:"100%",boxSizing:"border-box",fontSize:editor!.fontSize,padding:editor!.padding,
          fontFamily:properties["fo:font-family"],fontWeight:properties["fo:font-weight"]}}
        className="deditor-input" onFocus={(e) => e.target.select()}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") return;
          e.stopPropagation(); if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
          if (e.key === "Enter") { e.preventDefault(); commit(); focusCanvas(); }
          if (e.key === "Escape") { e.preventDefault(); cancelled.current = true; setEditing(false); focusCanvas(); }
        }} />
    </foreignObject> : relation.title ? <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="central"
      paintOrder="stroke" stroke={sheet.theme?.map?.properties?.["svg:fill"] ?? "#fff"} strokeWidth={6} strokeLinejoin="round"
      fill={properties["fo:color"] ?? color} fontSize={geometry.fontSize}
      fontFamily={properties["fo:font-family"] ?? "NeverMind, PingFang SC, Microsoft YaHei, sans-serif"}
      fontWeight={properties["fo:font-weight"]} style={{ cursor: readonly ? "pointer" : "text" }}>{relation.title}</text> : null}
  </g>;
}
