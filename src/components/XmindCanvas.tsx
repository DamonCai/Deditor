import XmindGroupHandles from "./XmindGroupHandles";
import { boundaryGeometry, summaryPath } from "../lib/xmind/groupShapes";
import { groupRangeAxis } from "../lib/xmind/groupRange";
import { punctuationPath } from "../lib/xmind/punctuationShapes";
import { draftBox } from "../lib/xmind/draft";
import { shapeName, shapePolygon, strokeDash, ellipticRectanglePath } from "../lib/xmind/shapes";
import { advancedShape, referenceSymbol } from "../lib/xmind/shapePaths";
import { topicDropTarget, type DropTarget } from "../lib/xmind/drop";
import XmindRelationship from "./XmindRelationship";
import XmindIndicator from "./XmindIndicator";
import { logError } from "../lib/logger";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  type Sheet,
  type Topic,
  type Command,
  findTopic,
  newTopic,
  duplicateTopic,
  selectedTopicRoots,
  walkTopics,
} from "../lib/xmind/document";
import {
  buildScene,
  nodeVisualBounds,
  edgePath,
  braceConnector,
  type SceneNode,
  type Measure,
} from "../lib/xmind/scene";
import { useT } from "../lib/i18n";
import { Button } from "./ui/Button";

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}
interface Props {
  sheet: Sheet;
  readonly: boolean;
  selected: string[];
  selectedGroup: string | null;
  selectedRelationship: string | null;
  onSelectRelationship: (id: string | null) => void;
  onSelectGroup: (id: string | null) => void;
  onSelect: (ids: string[]) => void;
  onCommand: (command: Command) => void;
  onUndo: () => void;
  onRedo: () => void;
  resources: Record<string, string>;
  query: string;
  camera?: Camera;
  onCamera: (camera: Camera) => void;
  onLink: (href: string) => void;
  onInspect: (field?: "notes", id?: string) => void;
  registerFlush: (flush: () => void) => () => void;
}
let measureContext: CanvasRenderingContext2D | null | undefined;
const measure: Measure = (text, size, p) => {
  if (measureContext === undefined)
    measureContext = document.createElement("canvas").getContext("2d");
  if (!measureContext) return Array.from(text).length * size * 0.7;
  measureContext.font = `${p["fo:font-style"] ?? "normal"} ${p["fo:font-weight"] ?? 400} ${size}px ${p["fo:font-family"] ?? "NeverMind, PingFang SC, Microsoft YaHei, sans-serif"}`;
  const metrics = measureContext.measureText(text);
  return Math.max(metrics.width, (metrics.actualBoundingBoxLeft || 0) + (metrics.actualBoundingBoxRight || 0));
};
function NodeShape({ node: n }: { node: SceneNode }) {
  const shape = shapeName(n.shape),
    w = n.width,
    h = n.height;
  const props = {
    fill: n.fill,
    fillOpacity: n.fillOpacity,
    stroke: n.stroke,
    strokeWidth: Math.max(0, Number.isFinite(parseFloat(n.properties["border-line-width"] ?? "")) ? parseFloat(n.properties["border-line-width"]) : 1.5),
    strokeDasharray: strokeDash(n.properties["border-line-pattern"]),
  };
  const reference=referenceSymbol(shape);
  if(reference) return reference==='on'
    ? <circle data-reference-symbol cx={w/2} cy={40} r={30} {...props} />
    : <path data-reference-symbol d={`M${w/2-30},10 H${w/2+30} V40 L${w/2},70 L${w/2-30},40 Z`} {...props} />;
  if(shape==='circle.double') return <>
    <circle cx={w/2} cy={h/2} r={w/2} {...props} />
    <circle cx={w/2} cy={h/2} r={Math.max(1,w/2-7)} {...props} fill="none" />
  </>;
  if(shape==='doublequote')return <g aria-hidden="true" fill={n.stroke} fontFamily="Georgia, serif" fontSize={Math.min(30,h*.55)} fontWeight={700}>
    <text x={2} y={h/2} dominantBaseline="central">“</text>
    <text x={w-2} y={h/2} textAnchor="end" dominantBaseline="central">”</text>
  </g>;
  const punctuation = punctuationPath(shape,w,h);
  if(punctuation) return <path data-punctuation d={punctuation} {...props} fill="none" strokeLinejoin="round" strokeLinecap="round" />;
  const advanced = advancedShape(shape, w, h);
  if (advanced) return <>
    {advanced.back && <path d={advanced.back} {...props} fill={shape==="multidocument"?"none":props.fill} />}
    <path d={advanced.path} {...props} strokeLinejoin="round" />
    {advanced.detail && <path d={advanced.detail} {...props} fill="none" />}
  </>;
  if (/ellipse|oval|^circle/.test(shape))
    return <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...props} />;
  if (shape === "ellipticrectangle") return <path d={ellipticRectanglePath(w,h)} {...props} />;
  const polygon = shapePolygon(shape, w, h);
  if (polygon) return <polygon points={polygon.map(p => p.join(",")).join(" ")} strokeLinejoin={shape === "roundedhexagon" ? "round" : undefined} {...props} />;
  if (shape.includes("underline"))
    return (
      <>
        <rect width={w} height={h} rx={4} fill={n.fill} fillOpacity={props.fillOpacity} />
        <path
          d={`M0,${h} H${w}${shape === "doubleunderline" ? ` M0,${h - 4} H${w}` : ""}`}
          fill="none"
          stroke={n.stroke}
          strokeWidth={props.strokeWidth}
          strokeDasharray={props.strokeDasharray}
        />
      </>
    );
  return (
    <rect
      width={w}
      height={h}
      rx={shape.includes("pill") ? h / 2 : shape.includes("round") ? 8 : 0}
      {...props}
    />
  );
}
function imageSource(t: Topic, resources: Record<string, string>) {
  const src = t.image?.src;
  if (!src) return;
  // Only embedded archive resources; opening a map never contacts image hosts.
  return resources[src.replace(/^xap:/, "").replace(/^\//, "")];
}
export default function XmindCanvas({
  sheet,
  readonly,
  selected,
  selectedGroup,
  selectedRelationship,
  onSelectRelationship: setSelectedRelationship,
  onSelectGroup,
  onSelect,
  onCommand,
  onUndo,
  onRedo,
  resources,
  query,
  camera: saved,
  onCamera,
  onInspect,
  onLink,
  registerFlush,
}: Props) {
  const t = useT(),
    host = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [camera, setCamera] = useState<Camera>(
    saved ?? { x: 0, y: 0, zoom: 1 },
  );
  // Document folding participates in save/undo. Search and outline revelation
  // are view-only overrides, so looking for a topic never dirties the file.
  const [foldOverrides, setFoldOverrides] = useState<Map<string, boolean>>(new Map());
  const folded = useMemo(() => {
    const result = new Set<string>();
    walkTopics(sheet.rootTopic, (n) => {
      if (foldOverrides.get(n.id) ?? n.branch === "folded") result.add(n.id);
    });
    return result;
  }, [sheet, foldOverrides]);
  const parents = useMemo(() => {
    const result = new Map<string, string>();
    walkTopics(sheet.rootTopic, (n, parent) => { if (parent) result.set(n.id, parent.id); });
    return result;
  }, [sheet]);
  const [editing, setEditing] = useState<string | null>(null),
    [draft, setDraft] = useState("");
  const relationshipFlush = useRef<(() => void) | null>(null);
  const setRelationshipFlush = useCallback((flush: (() => void) | null) => { relationshipFlush.current = flush; }, []);
  const [context, setContext] = useState<{ x: number; y: number } | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!context || !menu.current || !host.current) return;
    const bounds = host.current.getBoundingClientRect();
    const box = menu.current.getBoundingClientRect();
    menu.current.style.left = `${Math.max(6, Math.min(context.x, bounds.width - box.width - 6))}px`;
    menu.current.style.top = `${Math.max(6, Math.min(context.y, bounds.height - box.height - 6))}px`;
    menu.current.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [context, size]);
  const [dragOffset, setDragOffset] = useState<{
    id: string;
    ids: string[];
    x: number;
    y: number;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const pointer = useRef<{
    x: number;
    y: number;
    cx: number;
    cy: number;
    id?: string;
    ids: string[];
    multi: boolean;
    dragged: boolean;
  } | null>(null);
  const [fontsReady, setFontsReady] = useState(!document.fonts);
  useEffect(() => {
    if (!document.fonts) return;
    let live = true;
    Promise.all(
      [400, 500, 600, 700].map((weight) =>
        document.fonts.load(`${weight} 16px NeverMind`),
      ),
    )
      .then(() => {
        if (live) setFontsReady(true);
      })
      .catch((err) => {
        logError("xmind font load failed", err);
        if (live) setFontsReady(true);
      });
    return () => {
      live = false;
    };
  }, []);
  const scene = useMemo(
    () => buildScene(sheet, folded, measure),
    [sheet, folded, fontsReady],
  );
  const byId = useMemo(
    () => new Map(scene.nodes.map((n) => [n.topic.id, n])),
    [scene],
  );
  const fishboneRibs = useMemo(() => new Map(scene.edges
    .filter(edge => edge.direction === "fishbone" && edge.points?.length === 2)
    .map(edge => [edge.to, edge.points!])), [scene]);
  const draggedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const id of dragOffset?.ids ?? []) {
      const topic = findTopic(sheet.rootTopic, id);
      if (topic) walkTopics(topic, t => ids.add(t.id));
    }
    return ids;
  }, [sheet, dragOffset?.ids]);
  const displayById = useMemo(() => new Map(scene.nodes.map(n => [n.topic.id,
    dragOffset && draggedIds.has(n.topic.id) ? { ...n, x: n.x + dragOffset.x, y: n.y + dragOffset.y } : n])),
    [scene, dragOffset, draggedIds]);
  const dropAt = (x: number, y: number, ids: string[]) => {
    const moving = new Set<string>();
    ids.forEach(id => { const n = findTopic(sheet.rootTopic, id); if (n) walkTopics(n, t => moving.add(t.id)); });
    const r = svg.current!.getBoundingClientRect(), c = cameraRef.current;
    return topicDropTarget(scene.nodes, moving, c.x + (x-r.left-r.width/2)/c.zoom,
      c.y + (y-r.top-r.height/2)/c.zoom, c.zoom);
  };
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const initialFit = useRef(!!saved);
  const [measured, setMeasured] = useState(false);
  const viewport = {
    x: camera.x - size.width / 2 / camera.zoom,
    y: camera.y - size.height / 2 / camera.zoom,
    width: size.width / camera.zoom,
    height: size.height / camera.zoom,
  };
  const fit = () => {
    const b = scene.bounds;
    // Reserve screen space for the floating zoom bar even on very tall maps.
    const bottom = Math.min(64, size.height / 3);
    const zoom = Math.max(0.001, Math.min(1.3, Math.max(1,size.width-24)/b.width,
      Math.max(1,size.height-bottom)/b.height));
    setCamera({x:b.x+b.width/2,y:b.y+b.height/2+bottom/(2*zoom),zoom});
  };
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      if (r.width && r.height) {
        setSize({ width: r.width, height: r.height });
        setMeasured(true);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (initialFit.current || !measured || !fontsReady) return;
    initialFit.current = true;
    fit();
  }, [size, measured, fontsReady]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onCamera(camera), [camera, onCamera]);
  useEffect(() => {
    if (readonly) setEditing(null);
  }, [readonly]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea")) return;
      e.preventDefault();
      const c = cameraRef.current;
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect(),
          px = e.clientX - rect.left - rect.width / 2,
          py = e.clientY - rect.top - rect.height / 2;
        const zoom = Math.max(
          0.001,
          Math.min(4, c.zoom * Math.exp(-e.deltaY * 0.008)),
        );
        setCamera({
          x: c.x + px / c.zoom - px / zoom,
          y: c.y + py / c.zoom - py / zoom,
          zoom,
        });
      } else
        setCamera({
          ...c,
          x: c.x + e.deltaX / c.zoom,
          y: c.y + e.deltaY / c.zoom,
        });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  useEffect(() => {
    const hidden: string[] = [];
    for (const id of selected) {
      let parent = parents.get(id);
      while (parent) {
        if (folded.has(parent)) hidden.push(parent);
        parent = parents.get(parent);
      }
    }
    if (hidden.length) setFoldOverrides((old) => {
      const next = new Map(old);
      hidden.forEach((id) => next.set(id, false));
      return next;
    });
  }, [selected, parents]); // Fold changes alone must not reopen a collapsed selection.
  useEffect(() => {
    const id = selected[0];
    if (!id) return;
    const n = byId.get(id);
    if (
      n &&
      (n.x < viewport.x ||
        n.y < viewport.y ||
        n.x + n.width > viewport.x + viewport.width ||
        n.y + n.height > viewport.y + viewport.height)
    )
      setCamera((c) => ({ ...c, x: n.x + n.width / 2, y: n.y + n.height / 2 }));
  }, [selected, byId]); // eslint-disable-line react-hooks/exhaustive-deps
  const select = (id: string, multi = false) =>
    onSelect(
      multi
        ? selected.includes(id)
          ? selected.filter((s) => s !== id)
          : [...selected, id]
        : [id],
    );
  const cancelEditing = useRef(false);
  const startEdit = (id: string) => {
    cancelEditing.current = false;
    if (readonly) return;
    const n = findTopic(sheet.rootTopic, id);
    if (n) {
      onSelect([id]);
      setDraft(n.title);
      setEditing(id);
      setContext(null);
    }
  };
  const commitEdit = useCallback(() => {
    if (editing && !cancelEditing.current) {
      onCommand({ type: "title", id: editing, title: draft });
      setEditing(null);
    }
  }, [editing, draft, onCommand]);
  const commitRef = useRef(commitEdit);
  commitRef.current = commitEdit;
  useEffect(() => registerFlush(() => { commitRef.current(); relationshipFlush.current?.(); }), [registerFlush]);
  const add = (sibling = false, before = false) => {
    cancelEditing.current = false;
    if (readonly) return;
    const id = selected[0] ?? sheet.rootTopic.id,
      node = byId.get(id);
    const parent = sibling ? (node?.parent ?? id) : id;
    const topic = newTopic(t("xmind.topic"));
    onCommand({ type: "add", parent, topic, after: sibling && !before ? id : undefined, before: sibling && before ? id : undefined });
    onSelect([topic.id]);
    setDraft(topic.title);
    setEditing(topic.id);
    setFoldOverrides((old) => {
      const next = new Map(old);
      next.delete(parent);
      return next;
    });
  };
  const remove = () => {
    if (!readonly) {
      onCommand({ type: "delete", ids: selected });
      onSelect([sheet.rootTopic.id]);
    }
  };
  const toggleFold = useCallback((id: string) => {
    if (!findTopic(sheet.rootTopic, id)?.children?.attached?.length) return;
    const collapse = !folded.has(id);
    // Select the owner before hiding selected descendants.
    onSelect([id]);
    setFoldOverrides((old) => {
      const next = new Map(old);
      if (readonly) next.set(id, collapse);
      else next.delete(id);
      return next;
    });
    if (!readonly) onCommand({ type: "fold", ids: [id], folded: collapse });
  }, [sheet, folded, readonly, onSelect, onCommand]);
  const focusNode = (id: string) => {
    const n = byId.get(id);
    if (n) {
      onSelect([id]);
      setCamera((c) => ({ ...c, x: n.x + n.width / 2, y: n.y + n.height / 2 }));
    }
  };
  const matches = useMemo(() => {
    const found: Topic[] = [];
    if (query.trim()) walkTopics(sheet.rootTopic, (topic) => {
      if (topic.title.toLowerCase().includes(query.trim().toLowerCase())) found.push(topic);
    });
    return found;
  }, [sheet, query]);
  useEffect(() => {
    if (matches.length) onSelect([matches[0].id]);
  }, [query]); // A new search reveals the first match, including folded ancestors.
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input,textarea,select,button") && e.key !== "Escape")
      return;
    const mod = e.metaKey || e.ctrlKey;
    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      pointer.current = null;
      setDragOffset(null);
      setDropTarget(null);
      setContext(null);
      setEditing(null);
      setSelectedRelationship(null);
      onSelectGroup(null);
      host.current?.focus();
      return;
    }
    if (mod && e.key.toLowerCase() === "r") {
      e.preventDefault(); e.stopPropagation(); focusNode(sheet.rootTopic.id); return;
    }
    if (mod && e.key === "Enter" && !readonly) {
      e.preventDefault(); e.stopPropagation();
      const id=selected[0];
      if(!id || id===sheet.rootTopic.id) return;
      const topic=newTopic(t("xmind.topic"));
      onCommand({type:"parent",id,topic});onSelect([topic.id]);return;
    }
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && !readonly) {
      e.preventDefault(); e.stopPropagation();
      const roots=selectedTopicRoots(sheet.rootTopic,selected), parentId=parents.get(roots[0]?.id);
      const parent=parentId && findTopic(sheet.rootTopic,parentId);
      if(!parent || roots.some(n=>parents.get(n.id)!==parentId)) return;
      const siblings=parent.children?.attached ?? [], ids=new Set(roots.map(n=>n.id));
      const indices=siblings.flatMap((n,i)=>ids.has(n.id)?[i]:[]);
      if(!indices.length) return;
      const reversed=byId.get(parentId!)?.direction==='side' && byId.get(roots[0].id)?.direction==='left';
      const before=(e.key==='ArrowUp')!==reversed;
      const target=siblings[before ? Math.min(...indices)-1 : Math.max(...indices)+1];
      if(target) onCommand({type:"move-many",ids:[...ids],parent:parentId!,...(before?{before:target.id}:{after:target.id})});
      return;
    }
    if (mod && e.key === "/" && selected[0]) {
      e.preventDefault();
      e.stopPropagation();
      toggleFold(selected[0]);
      return;
    }
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      e.stopPropagation();
      onSelect(scene.nodes.map((n) => n.topic.id));
      return;
    }
    if (mod && e.key.toLowerCase() === "z" && !readonly) {
      e.preventDefault();
      e.stopPropagation();
      e.shiftKey ? onRedo() : onUndo();
      return;
    }
    if (
      mod &&
      (e.key === "=" || e.key === "+" || e.key === "-" || e.key === "0")
    ) {
      e.preventDefault();
      e.stopPropagation();
      e.key === "0"
        ? fit()
        : setCamera((c) => ({
            ...c,
            zoom: Math.max(
              0.001,
              Math.min(4, c.zoom * (e.key === "-" ? 0.8 : 1.25)),
            ),
          }));
      return;
    }
    if (e.key === "Tab" && !readonly && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      add();
    } else if (e.key === "Enter" && !readonly) {
      e.preventDefault();
      e.stopPropagation();
      add(true, e.shiftKey);
    } else if (e.key === "F2" && !readonly && selected[0]) {
      e.preventDefault();
      e.stopPropagation();
      startEdit(selected[0]);
    } else if ((e.key === "Delete" || e.key === "Backspace") && !readonly) {
      e.preventDefault();
      e.stopPropagation();
      if (selectedGroup) {
        const group=scene.groups.find(g=>g.id===selectedGroup);
        if(group) onCommand({type:"group-delete",id:group.id,parent:group.parent});
        onSelectGroup(null);
      } else if (selectedRelationship) {
        onCommand({ type: "relationship-delete", id: selectedRelationship });
        setSelectedRelationship(null);
      } else remove();
    } else if (e.key === " " && selected[0] && !readonly) {
      e.preventDefault();
      e.stopPropagation();
      startEdit(selected[0]);
    } else if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      const current = byId.get(selected[0]);
      if (!current) return;
      const cx = current.x + current.width / 2,
        cy = current.y + current.height / 2;
      const candidates = scene.nodes.filter((n) => {
        const dx = n.x + n.width / 2 - cx,
          dy = n.y + n.height / 2 - cy;
        return e.key === "ArrowRight"
          ? dx > 1
          : e.key === "ArrowLeft"
            ? dx < -1
            : e.key === "ArrowDown"
              ? dy > 1
              : dy < -1;
      });
      candidates.sort((a, b) => {
        const score = (n: SceneNode) => {
          const dx = n.x + n.width / 2 - cx,
            dy = n.y + n.height / 2 - cy;
          return (
            Math.hypot(dx, dy) +
            Math.abs(
              e.key === "ArrowLeft" || e.key === "ArrowRight" ? dy : dx,
            ) *
              2
          );
        };
        return score(a) - score(b);
      });
      if (candidates[0]) focusNode(candidates[0].topic.id);
    }
  };
  const act = (fn: () => void) => {
    fn();
    setContext(null);
    host.current?.focus();
  };
  const viewId = `xm-${sheet.id.replace(/[^a-zA-Z0-9]/g, "")}`;
  const braceEdges = useMemo(() => {
    const groups = new Map<string, typeof scene.edges>();
    for (const edge of scene.edges) if (edge.brace) {
      const edges = groups.get(edge.from) ?? [];
      edges.push(edge);
      groups.set(edge.from, edges);
    }
    return groups;
  }, [scene]);
  const sceneContent = useMemo(() => {
    const selectedIds = new Set(selected);
    const renderNode = (n: SceneNode) => {
          const chosen = selectedIds.has(n.topic.id),
            match =
              query &&
              n.topic.title.toLowerCase().includes(query.toLowerCase());
          const offset = draggedIds.has(n.topic.id) ? dragOffset : null;
          const img = imageSource(n.topic, resources),
            imageHeight = n.imageHeight;
          // Keep the caret and the scrollable draft inside the visible canvas,
          // including when zoomed into a small part of a very large topic.
          const editorViewport = query ? { ...viewport, y: viewport.y + 40 / camera.zoom, height: viewport.height - 40 / camera.zoom } : viewport;
          const editor = editing === n.topic.id ? draftBox(n, draft, editorViewport, camera.zoom, measure) : null;
          const isFolded = folded.has(n.topic.id);
          let hiddenCount = 0;
          const countChildren = (topic: Topic) => {
            for (const child of topic.children?.attached ?? []) { hiddenCount++; countChildren(child); }
          };
          if (isFolded) countChildren(n.topic);
          const foldRadius = isFolded ? Math.max(9, String(hiddenCount).length * 3.5 + 4) : 8;
          const foldLeft = n.direction === "left" || (n.direction === "fishbone" && n.topic.structureClass?.toLowerCase().includes("rightheaded"));
          let foldX = foldLeft ? -foldRadius - 4
            : n.direction === "down" || n.direction === "up" ? n.width / 2 : n.width + foldRadius + 4;
          let foldY = n.direction === "down" ? nodeVisualBounds(n).height + foldRadius + 4
            : n.direction === "up" ? -foldRadius - 4 : n.height / 2;
          const rib = fishboneRibs.get(n.topic.id);
          if (rib) {
            const [base, tip] = rib;
            const distance = foldRadius + 4;
            foldX = tip.x - n.x + (base.x - tip.x) / Math.abs(base.y - tip.y) * distance;
            foldY = tip.y - n.y + Math.sign(base.y - tip.y) * distance;
          }
          return (
            <g
              key={n.topic.id}
              data-topic={n.topic.id}
              data-editing={editing === n.topic.id || undefined}
              pointerEvents={offset ? "none" : undefined}
              data-parent={n.parent}
              data-detached={n.detached || undefined}
              role="treeitem"
              aria-label={n.topic.title}
              aria-selected={chosen}
              aria-expanded={
                n.topic.children?.attached?.length ? !isFolded : undefined
              }
              transform={`translate(${n.x + (offset?.x ?? 0)},${n.y + (offset?.y ?? 0)})`}
              style={{ cursor: readonly ? "pointer" : "grab" }}
            >
              <rect data-topic-hitbox width={nodeVisualBounds(n).width} height={nodeVisualBounds(n).height} fill="transparent" stroke="none" />
              {(chosen || match) && (
                <rect
                  x={-5}
                  y={-5}
                  width={n.width + 10}
                  height={n.height + 10}
                  rx={10}
                  fill="none"
                  stroke={chosen ? "#4787ed" : "#eebc42"}
                  strokeWidth={chosen ? 2.5 : 3}
                />
              )}
              <NodeShape node={n} />
              {img && (
                <image
                  href={img}
                  x={n.content.x + (n.content.width - n.imageWidth)/2}
                  y={n.content.y}
                  width={n.imageWidth}
                  height={imageHeight}
                  preserveAspectRatio="xMidYMid meet"
                />
              )}
              {editing === n.topic.id ? (
                <foreignObject
                  x={editor!.x}
                  y={editor!.y}
                  width={editor!.width}
                  height={editor!.height}
                >
                  <textarea
                    aria-label={t("xmind.editTitle")}
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitEdit}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        commitEdit();
                        host.current?.focus();
                      }
                      if (e.key === "Escape") {
                        cancelEditing.current = true;
                        setEditing(null);
                        host.current?.focus();
                      }
                    }}
                    style={{
                      width: "100%",
                      height: "100%",
                      resize: "none",
                      fontSize: editor!.fontSize,
                      fontFamily: n.properties["fo:font-family"] ?? "NeverMind, PingFang SC, Microsoft YaHei, sans-serif",
                      fontWeight: n.properties["fo:font-weight"] ?? 400,
                      fontStyle: n.properties["fo:font-style"],
                      lineHeight: 1.4,
                      padding: editor!.padding,
                      overflow: "auto",
                      margin: 0,
                      boxSizing: "border-box",
                      color: n.color,
                      background: n.fill === "none" || n.fill === "transparent" ? scene.background : n.fill,
                      border: "1px solid #4787ed",
                      textAlign: n.titleAnchor === "start" ? "left" : n.titleAnchor === "end" ? "right" : "center",
                      outline: "none",
                    }}
                  />
                </foreignObject>
              ) : (
                <text
                  x={n.titleX}
                  y={n.content.y + (imageHeight ? imageHeight + 8 : 0) + n.fontSize * 1.05}
                  textAnchor={n.titleAnchor}
                  fill={n.color}
                  fontFamily={
                    n.properties["fo:font-family"] ??
                    "NeverMind, PingFang SC, Microsoft YaHei, sans-serif"
                  }
                  fontSize={n.fontSize}
                  fontWeight={
                    n.properties["fo:font-weight"] ?? (n.depth < 2 ? 600 : 400)
                  }
                  fontStyle={n.properties["fo:font-style"]}
                  textDecoration={n.properties["fo:text-decoration"]}
                  pointerEvents="none"
                >
                  {n.lines.map((line, i) => (
                    <tspan
                      key={i}
                      x={n.titleX}
                      dy={i ? n.fontSize * 1.4 : 0}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
              )}
              {n.labels.map((label, index) => (
                <g key={index} data-label={index} pointerEvents="none">
                  <rect x={label.x} y={label.y} width={label.width} height={label.height}
                    rx={5} fill="#E9E9E9" />
                  <text x={label.x + label.width/2} y={label.y + 14} textAnchor="middle"
                    fontSize={11} fontWeight={400} fontStyle="normal"
                    fontFamily={n.properties["fo:font-family"] ?? "NeverMind, PingFang SC, Microsoft YaHei, sans-serif"}
                    fill="#555555">
                    {label.lines.map((line, i) => <tspan key={i} x={label.x + label.width/2} dy={i ? 16 : 0}>{line}</tspan>)}
                  </text>
                </g>
              ))}
              {editing !== n.topic.id && n.indicators.map((icon, i) => {
                const label = icon.kind === "task"
                  ? t("xmind.indicator.task", { percent: Math.round((icon.value ?? 0) * 100) })
                  : icon.kind === "priority" ? t("xmind.indicator.priority", { value: icon.value ?? 1 })
                    : t(`xmind.indicator.${icon.kind}`);
                const indicator = <XmindIndicator icon={icon} label={label} color={n.color}
                  x={n.indicatorPositions[i].x}
                  y={n.indicatorPositions[i].y} />;
                return icon.kind === "notes" || icon.kind === "link" ? <g key={i} data-note-button={icon.kind === "notes" ? true : undefined} data-link-button={icon.kind === "link" ? true : undefined} role="button" tabIndex={0}
                  aria-label={t(icon.kind === "notes" ? "xmind.openNotes" : "xmind.openLink")} style={{ cursor: "pointer" }}
                  onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); icon.kind === "notes" ? onInspect("notes", n.topic.id) : onLink(n.topic.href!); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault(); e.stopPropagation(); icon.kind === "notes" ? onInspect("notes", n.topic.id) : onLink(n.topic.href!);
                    }
                  }}>{indicator}</g> : <g key={i}>{indicator}</g>;
              })}
              {!!n.topic.children?.attached?.length && (
                <g
                  data-fold="true"
                  className="xm-fold"
                  data-folded={isFolded}
                  role="button"
                  aria-label={t(isFolded ? "xmind.expand" : "xmind.collapse")}
                  data-tooltip={t(isFolded ? "xmind.expand" : "xmind.collapse")}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFold(n.topic.id);
                  }}
                  transform={`translate(${foldX},${foldY})`}
                  style={{ cursor: "pointer" }}
                >
                  <circle r={foldRadius + 5} fill="transparent" />
                  <circle r={foldRadius} fill="#fff" stroke={n.lineColor} />
                  <text
                    textAnchor="middle"
                    dy={4}
                    fontSize={isFolded ? 11 : 13}
                    fill={n.lineColor}
                    pointerEvents="none"
                  >
                    {isFolded ? hiddenCount : "−"}
                  </text>
                </g>
              )}
            </g>
          );
    };
    const groupAncestors=new Map<string,number>();
    for(const group of scene.groups)for(const id of group.memberGroupIds??[])
      groupAncestors.set(id,(groupAncestors.get(id)??0)+1);
    return <>
        {[...scene.groups].sort((a,b)=>(groupAncestors.get(a.id)??0)-(groupAncestors.get(b.id)??0)).map((g) => {
          const lineWidth = parseFloat(g.properties["line-width"] ?? "2");
          const opacity = parseFloat(g.properties["svg:opacity"] ?? "0.2");
          const strokeWidth = Number.isFinite(lineWidth) ? Math.max(0, lineWidth) : 2;
          const dash = strokeDash(g.properties["line-pattern"] ?? (g.summary ? "solid" : "dash"));
          const boundary=g.summary?null:boundaryGeometry(g.properties['shape-class'],g.width,g.height,g.memberBoxes,g.padding,g.growthDirection);
          return (
          <g key={g.id} data-group={g.id} role="button" tabIndex={0} aria-label={g.title || t(g.summary ? "xmind.summary" : "xmind.boundary")}
            aria-pressed={selectedGroup === g.id}
            onKeyDown={e=>{if(e.key==='Enter'||e.key===' ') {e.preventDefault();e.stopPropagation();setSelectedRelationship(null);onSelectGroup(g.id);host.current?.focus();}}}
            onPointerDown={e=>{e.stopPropagation();host.current?.focus();setSelectedRelationship(null);onSelectGroup(g.id);}}
            onClick={e=>{e.stopPropagation();setSelectedRelationship(null);onSelectGroup(g.id);}}
            onDoubleClick={e=>{e.stopPropagation();onSelectGroup(g.id);}}
            style={{cursor:"pointer"}} transform={dragOffset && draggedIds.has(g.parent) ? `translate(${dragOffset.x},${dragOffset.y})` : undefined}>
            {selectedGroup === g.id && <rect x={g.x-4} y={g.y-4} width={g.width+8} height={g.height+8} rx={16} fill="none" stroke="var(--accent)" strokeWidth={2} pointerEvents="none" />}
            <rect x={g.x} y={g.y} width={g.width} height={g.height} rx={14} fill="none" stroke="transparent" strokeWidth={14/camera.zoom} pointerEvents="stroke" />
            {g.summary ? (
              <path
                transform={
                  g.side === "left"
                    ? `translate(${g.x},${g.y}) scale(-1,1)`
                    : g.side === "down"
                      ? `translate(${g.x},${g.y + g.height}) matrix(0,1,1,0,0,0)`
                      : g.side === "up"
                        ? `translate(${g.x},${g.y}) matrix(0,-1,1,0,0,0)`
                        : `translate(${g.x + g.width},${g.y})`
                }
                d={summaryPath(g.properties["shape-class"], g.side === "up" || g.side === "down" ? g.width : g.height)}
                fill="none"
                stroke={g.properties["line-color"] ?? "#94a3b8"}
                strokeWidth={strokeWidth}
                strokeDasharray={dash}
              />
            ) : boundary ? (
              <g transform={`translate(${g.x},${g.y})`} data-boundary-shape={g.properties['shape-class']}>
                <path d={boundary.fillPath} fill={g.properties['fill-pattern']==='none'?'none':g.properties['svg:fill'] ?? '#e9f1fa'}
                  fillOpacity={Number.isFinite(opacity)?Math.max(0,Math.min(1,opacity)):0.2} pointerEvents="none" />
                <path d={boundary.borderPath} fill="none" stroke={g.properties['line-color'] ?? '#a2b3c9'} strokeWidth={strokeWidth} strokeDasharray={dash} pointerEvents="none" />
                <path d={boundary.borderPath} fill="none" stroke="transparent" strokeWidth={14/camera.zoom} pointerEvents="stroke" />
              </g>
            ) : (
              <rect
                x={g.x}
                y={g.y}
                width={g.width}
                height={g.height}
                rx={g.properties["shape-class"]?.split(".").pop()?.toLowerCase() === "rect" ? 0 : 14}
                fill={g.properties["fill-pattern"] === "none" ? "none" : g.properties["svg:fill"] ?? "#e9f1fa"}
                pointerEvents="none"
                fillOpacity={Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 0.2}
                stroke={g.properties["line-color"] ?? "#a2b3c9"}
                strokeWidth={strokeWidth}
                strokeDasharray={dash}
              />
            )}
            {g.titleLines.length > 0 && <g data-group-title={g.id}>
              <rect x={g.x+g.titleOffsetX} y={g.y-g.titleHeight}
                width={g.titleWidth} height={g.titleHeight} rx={4} fill={g.properties["line-color"]} />
              <text x={g.x+g.titleOffsetX+g.titleWidth/2} y={g.y-g.titleHeight+4+g.titleFontSize}
                textAnchor="middle" fill={g.properties["fo:color"]} fontSize={g.titleFontSize}
                fontFamily={g.properties["fo:font-family"]} fontWeight={g.properties["fo:font-weight"]}>
                {g.titleLines.map((line,i)=><tspan key={i} x={g.x+g.titleOffsetX+g.titleWidth/2} dy={i?g.titleLineHeight:0}>{line}</tspan>)}
              </text>
            </g>}
          </g>
        );})}
        {[...braceEdges].map(([id, edges]) => {
          const from = displayById.get(id)!;
          return (
            <path
              key={`brace-${id}`}
              d={braceConnector(
                from,
                edges.map((e) => displayById.get(e.to)!),
                edges[0].direction === "left",
              )}
              fill="none"
              stroke={from.lineColor}
              strokeWidth={2}
            />
          );
        })}
        {scene.edges.map((e, i) => {
          if (e.brace) return null;
          const from = displayById.get(e.from),
            to = displayById.get(e.to);
          return from && to ? (
            <path
              key={i}
              d={edgePath(dragOffset && draggedIds.has(e.from) && draggedIds.has(e.to) ? {
                ...e,
                points: e.points?.map(p => ({x:p.x+dragOffset.x,y:p.y+dragOffset.y})),
                trunk: e.trunk?.map(p => ({x:p.x+dragOffset.x,y:p.y+dragOffset.y})),
              } : e, from, to)}
              data-callout-tail={e.callout || undefined}
              fill={e.callout ? to.fill : "none"}
              stroke={e.callout ? "none" : to.lineColor}
              strokeWidth={parseFloat(
                (e.points ? to : from).properties["line-width"] ?? (to.depth === 1 ? "2.5" : "1.5"),
              )}
            />
          ) : null;
        })}
        {scene.nodes.filter(n => n.topic.id !== editing).map(renderNode)}
        {[...(sheet.relationships ?? [])].sort((a, b) =>
          Number(a.id === selectedRelationship) - Number(b.id === selectedRelationship)
        ).map((relation) => {
          const from = displayById.get(relation.end1Id), to = displayById.get(relation.end2Id);
          if (!from || !to) return null;
          return <XmindRelationship key={relation.id} relation={relation} sheet={sheet} from={from} to={to} nodes={Array.from(displayById.values())}
            readonly={readonly} selected={selectedRelationship === relation.id} markerPrefix={viewId}
            onSelect={() => { onSelectGroup(null); onSelect([]); setSelectedRelationship(relation.id); }}
            onCommand={onCommand} registerFlush={setRelationshipFlush}
            viewport={viewport} zoom={camera.zoom} measure={measure}
            toWorld={(x, y) => {
              const rect = svg.current!.getBoundingClientRect();
              const c = cameraRef.current;
              return { x: c.x + (x - rect.left - rect.width / 2) / c.zoom,
                y: c.y + (y - rect.top - rect.height / 2) / c.zoom };
            }} />;
        })}
        {!readonly && selectedGroup && (()=>{
          const box=scene.groups.find(g=>g.id===selectedGroup);
          const ownerNode=box&&displayById.get(box.parent);
          if(!box||!ownerNode)return null;
          const owner=ownerNode.topic,group=[...(owner.boundaries??[]),...(owner.summaries??[])].find(g=>g.id===box.id);
          if(!group)return null;
          const axis=groupRangeAxis(ownerNode,Array.from(displayById.values()));
          return <XmindGroupHandles key={box.id} group={group} box={box} owner={owner} nodes={Array.from(displayById.values())}
            zoom={camera.zoom} axis={axis} onCommand={onCommand} toWorld={(x,y)=>{
              const rect=svg.current!.getBoundingClientRect(),c=cameraRef.current;
              return {x:c.x+(x-rect.left-rect.width/2)/c.zoom,y:c.y+(y-rect.top-rect.height/2)/c.zoom};
            }}/>;
        })()}
        {scene.nodes.filter(n => n.topic.id === editing).map(renderNode)}
    </>;
  }, [scene, selected, query, dragOffset, resources, readonly, editing, draft, editing || selectedRelationship || selectedGroup ? camera : null, size.width, size.height,
    folded, t, commitEdit, toggleFold, byId, displayById, draggedIds, braceEdges, fishboneRibs, sheet, viewId,
    selectedRelationship, selectedGroup, onSelectGroup, onCommand, onSelect, onInspect, onLink, setRelationshipFlush]);

  return (
    <div
      ref={host}
      className="xm-canvas"
      role="region"
      aria-label={t("xmind.canvas")}
      tabIndex={0}
      onKeyDown={onKey}
      onCopy={(e) => {
        if (editing || (e.target as Element).closest("input,textarea,[contenteditable=true]")) return;
        const chosen = selectedTopicRoots(sheet.rootTopic, selected);
        if (chosen.length) {
          e.clipboardData.setData(
            "text/plain",
            chosen.map((n) => n.title).join("\n"),
          );
          e.clipboardData.setData(
            "application/x-deditor-topics",
            JSON.stringify(chosen),
          );
          e.preventDefault();
        }
      }}
      onPaste={(e) => {
        if (readonly || editing || (e.target as Element).closest("input,textarea,[contenteditable=true]")) return;
        const raw = e.clipboardData.getData("application/x-deditor-topics");
        const text = e.clipboardData.getData("text/plain");
        if (!raw && !text) return;
        e.preventDefault();
        try {
          const topics: Topic[] = raw
            ? JSON.parse(raw)
            : text.split("\n").filter(Boolean).map(newTopic);
          if (!Array.isArray(topics) || !topics.length) return;
          // Validate/duplicate the whole clipboard before publishing one transaction.
          const incoming = topics.map(duplicateTopic);
          const parent = selected[0] ?? sheet.rootTopic.id;
          onCommand({ type: "paste", parent, topics: incoming });
          setFoldOverrides((old) => {
            const next = new Map(old);
            next.delete(parent);
            return next;
          });
        } catch (err) {
          logError("xmind paste failed", err);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        const n = (e.target as Element)
          .closest("[data-topic]")
          ?.getAttribute("data-topic");
        if (n && !selected.includes(n)) onSelect([n]);
        const r = host.current!.getBoundingClientRect();
        setContext({
          x: e.clientX - r.left,
          y: e.clientY - r.top,
        });
      }}
    >
      <svg
        ref={svg}
        className="xm-svg"
        style={{ background: scene.background }}
        viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
        aria-label={sheet.title}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.button !== 1) return;
          if ((e.target as Element).closest("textarea,[data-fold]")) return;
          setContext(null);
          setSelectedRelationship(null);
          onSelectGroup(null);
          host.current?.focus();
          const id =
            (e.target as Element)
              .closest("[data-topic]")
              ?.getAttribute("data-topic") ?? undefined;
          const multi = e.shiftKey || e.metaKey || e.ctrlKey;
          const ids = id && selected.includes(id) && !multi ? selected : id ? [id] : [];
          if (e.button === 0) {
            if (id && (multi || !selected.includes(id))) select(id, multi);
            else if (!id) onSelect([]);
          }
          const roots = selectedTopicRoots(sheet.rootTopic, ids.filter(id => id !== sheet.rootTopic.id));
          const callout = scene.edges.some(edge => edge.callout && edge.to === id);
          pointer.current = {
            x: e.clientX,
            y: e.clientY,
            cx: camera.x,
            cy: camera.y,
            id: !readonly && e.button === 0 ? id : undefined,
            ids: callout && id ? [id] : roots.map(n => n.id),
            multi,
            dragged: false,
          };
        }}
        onPointerMove={(e) => {
          const p = pointer.current;
          if (!p) return;
          const dx = e.clientX - p.x,
            dy = e.clientY - p.y;
          if (Math.hypot(dx, dy) < 5 && !p.dragged) return;
          if (!p.dragged) e.currentTarget.setPointerCapture(e.pointerId);
          p.dragged = true;
          if (p.id && p.id !== sheet.rootTopic.id) {
            setDragOffset({ id: p.id, ids: p.ids, x: dx / camera.zoom, y: dy / camera.zoom });
            setDropTarget(scene.edges.some(edge => edge.callout && edge.to === p.id) ? null : dropAt(e.clientX,e.clientY,p.ids));
          } else
            setCamera((c) => ({
              ...c,
              x: p.cx - dx / c.zoom,
              y: p.cy - dy / c.zoom,
            }));
        }}
        onPointerUp={(e) => {
          const p = pointer.current;
          pointer.current = null;
          setDragOffset(null);
          setDropTarget(null);
          if (!p?.dragged) { if (p?.id && !p.multi) onSelect([p.id]); return; }
          if (!p.id || p.id === sheet.rootTopic.id) return;
          const callout = scene.edges.find((edge) => edge.callout && edge.to === p.id);
          if (callout) {
            const node = byId.get(p.id)!, parent = byId.get(callout.from)!;
            // Callouts stay attached to their owner; their coordinates are
            // relative to its centre, unlike free topics in canvas space.
            onCommand({
              type: "position", id: p.id,
              x: node.x + node.width / 2 - parent.x - parent.width / 2 + (e.clientX - p.x) / camera.zoom,
              y: node.y + node.height / 2 - parent.y - parent.height / 2 + (e.clientY - p.y) / camera.zoom,
            });
            return;
          }
          const drop = dropAt(e.clientX, e.clientY, p.ids);
          if (drop?.kind === "invalid") return;
          if (drop) {
            onCommand({ type: "move-many", ids: p.ids, parent: drop.parent,
              ...(drop.kind === "before" ? { before: drop.target } : drop.kind === "after" ? { after: drop.target } : {}) });
          } else {
            const positions: Record<string, {x:number;y:number}> = {};
            p.ids.forEach(id => { const n=byId.get(id); if(n) positions[id]={
              x:n.x+n.width/2+(e.clientX-p.x)/camera.zoom, y:n.y+n.height/2+(e.clientY-p.y)/camera.zoom }; });
            onCommand({ type: "move-many", ids: p.ids, parent: sheet.rootTopic.id, positions });
          }
          onSelect(p.ids);
        }}
        onPointerCancel={() => {
          pointer.current = null;
          setDragOffset(null);
          setDropTarget(null);
        }}
        onDoubleClick={(e) => {
          const id = (e.target as Element)
            .closest("[data-topic]")
            ?.getAttribute("data-topic");
          if ((e.target as Element).closest("[data-fold]")) return;
          if (id) startEdit(id);
          else if (!readonly) {
            const r = svg.current!.getBoundingClientRect();
            const topic = newTopic(t("xmind.floating"));
            topic.position = {
              x: viewport.x + (e.clientX - r.left) / camera.zoom,
              y: viewport.y + (e.clientY - r.top) / camera.zoom,
            };
            onCommand({
              type: "add",
              parent: sheet.rootTopic.id,
              topic,
              kind: "detached",
            });
            onSelect([topic.id]);
          }
        }}
      >
        {sceneContent}
        {dropTarget && (() => {
          const n=byId.get(dropTarget.target); if(!n) return null;
          return <g data-drop-kind={dropTarget.kind} pointerEvents="none" stroke={dropTarget.kind === "invalid" ? "var(--error-text)" : "var(--accent)"} fill="none" strokeWidth={2/camera.zoom}>
            {dropTarget.line ? <line {...dropTarget.line} /> : <rect x={n.x-4} y={n.y-4} width={n.width+8} height={n.height+8} rx={8} />}
          </g>;
        })()}
      </svg>
      <div className="xm-zoom">
        <Button
          size="sm"
          onClick={() =>
            setCamera((c) => ({ ...c, zoom: Math.max(0.001, c.zoom / 1.2) }))
          }
          aria-label={t("xmind.zoomOut")}
          title={t("xmind.zoomOut")}
        >
          −
        </Button>
        <span>{Math.round(camera.zoom * 100)}%</span>
        <Button
          size="sm"
          onClick={() =>
            setCamera((c) => ({ ...c, zoom: Math.min(4, c.zoom * 1.2) }))
          }
          aria-label={t("xmind.zoomIn")}
          title={t("xmind.zoomIn")}
        >
          +
        </Button>
        <Button size="sm" onClick={fit}>
          {t("xmind.fit")}
        </Button>
      </div>
      {query && (
        <div className="xm-search-count">
          {matches.length} {t("xmind.matches")}
          <Button
            size="sm"
            disabled={!matches.length}
            onClick={() => {
              const i = matches.findIndex((n) => n.id === selected[0]);
              onSelect([matches[(i + 1) % matches.length].id]);
            }}
          >
            {t("xmind.next")}
          </Button>
        </div>
      )}
      {!!scene.warnings.length && (
        <div className="xm-warning" role="status" aria-label={t("xmind.approximate")}
          data-tooltip={t("xmind.approximate")}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" />
            <path d="M8 7v4" stroke="currentColor" /><circle cx="8" cy="4.5" r=".8" fill="currentColor" />
          </svg>
        </div>
      )}
      {context && (
        <div
          ref={menu}
          className="xm-context"
          role="menu"
          onKeyDown={(e) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End", "Tab"].includes(e.key)) return;
            e.preventDefault();
            e.stopPropagation();
            const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
            const step = e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey) ? -1 : 1;
            buttons[e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1
              : (index + step + buttons.length) % buttons.length]?.focus();
          }}
          style={{ left: Math.max(0, context.x), top: Math.max(0, context.y) }}
        >
          {!readonly && (
            <>
              <Button onClick={() => act(() => add())}>
                {t("xmind.child")} · Tab
              </Button>
              <Button onClick={() => act(() => add(true))}>
                {t("xmind.sibling")} · Enter
              </Button>
              <Button
                disabled={!selected.length}
                onClick={() => act(() => startEdit(selected[0]))}
              >
                {t("xmind.rename")} · F2
              </Button>
              <Button disabled={!selected.length} onClick={() => act(remove)}>
                {t("common.delete")}
              </Button>
            </>
          )}
          <Button
            disabled={!findTopic(sheet.rootTopic, selected[0])?.children?.attached?.length}
            onClick={() => act(() => toggleFold(selected[0]))}
          >
            {t("xmind.fold")}
          </Button>
          <Button onClick={() => act(() => onInspect())}>{t("xmind.inspector")}</Button>
          <Button onClick={() => act(fit)}>{t("xmind.fit")}</Button>
          <Button onClick={() => setContext(null)}>{t("common.close")}</Button>
        </div>
      )}
    </div>
  );
}
