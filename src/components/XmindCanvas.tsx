import XmindIndicator from "./XmindIndicator";
import { logError } from "../lib/logger";
import {
  useEffect,
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
  walkTopics,
} from "../lib/xmind/document";
import {
  buildScene,
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
  onSelect: (ids: string[]) => void;
  onCommand: (command: Command) => void;
  onUndo: () => void;
  onRedo: () => void;
  resources: Record<string, string>;
  query: string;
  camera?: Camera;
  onCamera: (camera: Camera) => void;
  onInspect: () => void;
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
  const shape = n.shape.toLowerCase(),
    w = n.width,
    h = n.height;
  const props = {
    fill: n.fill,
    stroke: n.stroke,
    strokeWidth: parseFloat(n.properties["border-line-width"] ?? "1.5"),
  };
  if (/ellipse|oval/.test(shape))
    return <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...props} />;
  if (shape.includes("diamond"))
    return (
      <path
        d={`M${w / 2},0 L${w},${h / 2} ${w / 2},${h} 0,${h / 2} Z`}
        {...props}
      />
    );
  if (shape.includes("underline"))
    return (
      <>
        <rect width={w} height={h} rx={4} fill={n.fill} />
        <path
          d={`M0,${h} H${w}`}
          fill="none"
          stroke={n.stroke}
          strokeWidth={props.strokeWidth}
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
  onSelect,
  onCommand,
  onUndo,
  onRedo,
  resources,
  query,
  camera: saved,
  onCamera,
  onInspect,
  registerFlush,
}: Props) {
  const t = useT(),
    host = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [camera, setCamera] = useState<Camera>(
    saved ?? { x: 0, y: 0, zoom: 1 },
  );
  const [folded, setFolded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    walkTopics(sheet.rootTopic, (n) => {
      if (n.branch === "folded") s.add(n.id);
    });
    return s;
  });
  const [editing, setEditing] = useState<string | null>(null),
    [draft, setDraft] = useState("");
  const [context, setContext] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const pointer = useRef<{
    x: number;
    y: number;
    cx: number;
    cy: number;
    id?: string;
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
    setCamera({
      x: b.x + b.width / 2,
      y: b.y + b.height / 2,
      zoom: Math.max(
        0.001,
        Math.min(1.3, size.width / b.width, size.height / b.height),
      ),
    });
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
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const commitEdit = () => {
    if (editing && !cancelEditing.current) {
      onCommand({ type: "title", id: editing, title: draft });
      setEditing(null);
    }
  };
  const commitRef = useRef(commitEdit);
  commitRef.current = commitEdit;
  useEffect(() => registerFlush(() => commitRef.current()), [registerFlush]);
  const add = (sibling = false) => {
    cancelEditing.current = false;
    if (readonly) return;
    const id = selected[0] ?? sheet.rootTopic.id,
      node = byId.get(id);
    const parent = sibling ? (node?.parent ?? id) : id;
    const topic = newTopic(t("xmind.topic"));
    onCommand({ type: "add", parent, topic, after: sibling ? id : undefined });
    onSelect([topic.id]);
    setDraft(topic.title);
    setEditing(topic.id);
    setFolded((old) => {
      const next = new Set(old);
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
  const toggleFold = (id: string) =>
    setFolded((old) => {
      const next = new Set(old);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const focusNode = (id: string) => {
    const n = byId.get(id);
    if (n) {
      onSelect([id]);
      setCamera((c) => ({ ...c, x: n.x + n.width / 2, y: n.y + n.height / 2 }));
    }
  };
  const matches = useMemo(
    () =>
      query
        ? scene.nodes.filter((n) =>
            n.topic.title.toLowerCase().includes(query.toLowerCase()),
          )
        : [],
    [scene, query],
  );
  useEffect(() => {
    if (matches.length) focusNode(matches[0].topic.id);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input,textarea,select,button"))
      return;
    const mod = e.metaKey || e.ctrlKey;
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      setContext(null);
      setEditing(null);
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
      add(true);
    } else if (e.key === "F2" && !readonly && selected[0]) {
      e.preventDefault();
      e.stopPropagation();
      startEdit(selected[0]);
    } else if ((e.key === "Delete" || e.key === "Backspace") && !readonly) {
      e.preventDefault();
      e.stopPropagation();
      remove();
    } else if (e.key === " " && selected[0]) {
      e.preventDefault();
      toggleFold(selected[0]);
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
  return (
    <div
      ref={host}
      className="xm-canvas"
      role="region"
      aria-label={t("xmind.canvas")}
      tabIndex={0}
      onKeyDown={onKey}
      onCopy={(e) => {
        if (editing) return;
        const chosen = selected
          .map((id) => findTopic(sheet.rootTopic, id))
          .filter(Boolean) as Topic[];
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
        if (readonly || editing) return;
        const raw = e.clipboardData.getData("application/x-deditor-topics");
        const text = e.clipboardData.getData("text/plain");
        if (!raw && !text) return;
        e.preventDefault();
        try {
          const topics: Topic[] = raw
            ? JSON.parse(raw)
            : text.split("\n").filter(Boolean).map(newTopic);
          for (const n of topics)
            onCommand({
              type: "add",
              parent: selected[0] ?? sheet.rootTopic.id,
              topic: duplicateTopic(n),
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
          x: Math.min(e.clientX - r.left, r.width - 190),
          y: Math.min(e.clientY - r.top, r.height - 260),
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
          host.current?.focus();
          const id =
            (e.target as Element)
              .closest("[data-topic]")
              ?.getAttribute("data-topic") ?? undefined;
          if (id) select(id, e.shiftKey || e.metaKey || e.ctrlKey);
          else onSelect([]);
          pointer.current = {
            x: e.clientX,
            y: e.clientY,
            cx: camera.x,
            cy: camera.y,
            id: !readonly && e.button === 0 ? id : undefined,
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
          if (p.id && p.id !== sheet.rootTopic.id)
            setDragOffset({
              id: p.id,
              x: dx / camera.zoom,
              y: dy / camera.zoom,
            });
          else
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
          if (!p?.dragged || !p.id || p.id === sheet.rootTopic.id) return;
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
          const target = document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest("[data-topic]")
            ?.getAttribute("data-topic");
          if (target && target !== p.id) {
            onCommand({ type: "move", id: p.id, parent: target });
          } else {
            const node = byId.get(p.id);
            if (node)
              onCommand({
                type: "move",
                id: p.id,
                parent: sheet.rootTopic.id,
                position: {
                  x: node.x + node.width / 2 + (e.clientX - p.x) / camera.zoom,
                  y: node.y + node.height / 2 + (e.clientY - p.y) / camera.zoom,
                },
              });
          }
        }}
        onPointerCancel={() => {
          pointer.current = null;
          setDragOffset(null);
        }}
        onDoubleClick={(e) => {
          const id = (e.target as Element)
            .closest("[data-topic]")
            ?.getAttribute("data-topic");
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
        <defs>
          <marker
            id={viewId}
            viewBox="0 0 10 10"
            refX={9}
            refY={5}
            markerWidth={7}
            markerHeight={7}
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="#8490a1" />
          </marker>
        </defs>
        {scene.groups.map((g) => (
          <g key={g.id} pointerEvents="none">
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
                d={`M0,0 C18,0 18,0 18,${(g.side === "up" || g.side === "down" ? g.width : g.height) / 2 - 10} Q18,${(g.side === "up" || g.side === "down" ? g.width : g.height) / 2} 30,${(g.side === "up" || g.side === "down" ? g.width : g.height) / 2} Q18,${(g.side === "up" || g.side === "down" ? g.width : g.height) / 2} 18,${(g.side === "up" || g.side === "down" ? g.width : g.height) / 2 + 10} C18,${g.side === "up" || g.side === "down" ? g.width : g.height} 18,${g.side === "up" || g.side === "down" ? g.width : g.height} 0,${g.side === "up" || g.side === "down" ? g.width : g.height}`}
                fill="none"
                stroke={g.properties["line-color"] ?? "#94a3b8"}
                strokeWidth={2}
              />
            ) : (
              <rect
                x={g.x}
                y={g.y}
                width={g.width}
                height={g.height}
                rx={14}
                fill={g.properties["svg:fill"] ?? "#e9f1fa"}
                fillOpacity={0.45}
                stroke={g.properties["line-color"] ?? "#a2b3c9"}
                strokeDasharray="5 3"
              />
            )}
            <text x={g.x + 10} y={g.y - 5} fill="#64748b" fontSize={12}>
              {g.title}
            </text>
          </g>
        ))}
        {[
          ...new Set(scene.edges.filter((e) => e.brace).map((e) => e.from)),
        ].map((id) => {
          const edges = scene.edges.filter((e) => e.brace && e.from === id),
            from = byId.get(id)!;
          return (
            <path
              key={`brace-${id}`}
              d={braceConnector(
                from,
                edges.map((e) => byId.get(e.to)!),
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
          const from = byId.get(e.from),
            to = byId.get(e.to);
          return from && to ? (
            <path
              key={i}
              d={edgePath(e, from, e.callout && dragOffset?.id === e.to
                ? { ...to, x: to.x + dragOffset.x, y: to.y + dragOffset.y }
                : to)}
              data-callout-tail={e.callout || undefined}
              fill={e.callout ? to.fill : "none"}
              stroke={e.callout ? "none" : to.lineColor}
              strokeWidth={parseFloat(
                (e.points ? to : from).properties["line-width"] ?? (to.depth === 1 ? "2.5" : "1.5"),
              )}
            />
          ) : null;
        })}
        {(sheet.relationships ?? []).map((r) => {
          const a = byId.get(r.end1Id),
            b = byId.get(r.end2Id);
          if (!a || !b) return null;
          const ax = a.x + a.width / 2,
            ay = a.y,
            bx = b.x + b.width / 2,
            by = b.y,
            top = Math.min(ay, by) - 60;
          return (
            <g key={r.id}>
              <path
                d={`M${ax},${ay} C${ax},${top} ${bx},${top} ${bx},${by}`}
                stroke={r.style?.properties?.["line-color"] ?? "#8490a1"}
                strokeWidth={1.5}
                fill="none"
                strokeDasharray="6 4"
                markerEnd={`url(#${viewId})`}
              />
              <text
                x={(ax + bx) / 2}
                y={top + 8}
                textAnchor="middle"
                fontSize={12}
                fill="#64748b"
              >
                {r.title}
              </text>
            </g>
          );
        })}
        {scene.nodes.map((n) => {
          const chosen = selected.includes(n.topic.id),
            match =
              query &&
              n.topic.title.toLowerCase().includes(query.toLowerCase());
          const offset = dragOffset?.id === n.topic.id ? dragOffset : null;
          const img = imageSource(n.topic, resources),
            imageHeight = n.imageHeight;
          const isFolded = folded.has(n.topic.id);
          return (
            <g
              key={n.topic.id}
              data-topic={n.topic.id}
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
                  x={n.content.x}
                  y={n.content.y}
                  width={n.content.width}
                  height={imageHeight}
                  preserveAspectRatio="xMidYMid meet"
                />
              )}
              {editing === n.topic.id ? (
                <foreignObject
                  x={n.content.x}
                  y={n.content.y + (imageHeight ? imageHeight + 8 : 0)}
                  width={n.content.width}
                  height={n.lines.length * n.fontSize * 1.4}
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
                      if (e.nativeEvent.isComposing) return;
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
                      fontSize: n.fontSize,
                      color: n.color,
                      background: n.fill,
                      border: "1px solid #4787ed",
                      textAlign: "center",
                      outline: "none",
                    }}
                  />
                </foreignObject>
              ) : (
                <text
                  x={n.width / 2}
                  y={n.content.y + (imageHeight ? imageHeight + 8 : 0) + n.fontSize * 1.05}
                  textAnchor="middle"
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
                  pointerEvents="none"
                >
                  {n.lines.map((line, i) => (
                    <tspan
                      key={i}
                      x={n.width / 2}
                      dy={i ? n.fontSize * 1.4 : 0}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
              )}
              {!!n.labelLines.length && <text x={n.width / 2} y={n.labelY + 11}
                textAnchor="middle" fontSize={11} fontWeight={400} fontStyle="normal"
                fontFamily={n.properties["fo:font-family"] ?? "NeverMind, PingFang SC, Microsoft YaHei, sans-serif"}
                fill={n.color} opacity={0.7} pointerEvents="none">
                {n.labelLines.map((line, i) => <tspan key={i} x={n.width / 2} dy={i ? 16 : 0}>{line}</tspan>)}
              </text>}
              {n.indicators.map((icon, i) => {
                const row = Math.floor(i / n.indicatorColumns);
                const columns = Math.min(n.indicatorColumns, n.indicators.length - row * n.indicatorColumns);
                const label = icon.kind === "task"
                  ? t("xmind.indicator.task", { percent: Math.round((icon.value ?? 0) * 100) })
                  : icon.kind === "priority" ? t("xmind.indicator.priority", { value: icon.value ?? 1 })
                    : t(`xmind.indicator.${icon.kind}`);
                return <XmindIndicator key={i} icon={icon} label={label} color={n.color}
                  x={(n.width - (columns * 20 - 4)) / 2 + (i % n.indicatorColumns) * 20}
                  y={n.indicatorY + row * 20} />;
              })}
              {!!n.topic.children?.attached?.length && (
                <g
                  data-fold="true"
                  role="button"
                  aria-label={t(isFolded ? "xmind.expand" : "xmind.collapse")}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFold(n.topic.id);
                  }}
                  transform={`translate(${n.width + 11},${n.height / 2})`}
                  style={{ cursor: "pointer" }}
                >
                  <circle r={8} fill="#fff" stroke={n.lineColor} />
                  <text
                    textAnchor="middle"
                    dy={4}
                    fontSize={13}
                    fill={n.lineColor}
                  >
                    {isFolded ? "+" : "−"}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <div className="xm-zoom">
        <Button
          size="sm"
          onClick={() =>
            setCamera((c) => ({ ...c, zoom: Math.max(0.001, c.zoom / 1.2) }))
          }
          aria-label={t("xmind.zoomOut")}
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
              const i = matches.findIndex((n) => n.topic.id === selected[0]);
              focusNode(matches[(i + 1) % matches.length].topic.id);
            }}
          >
            {t("xmind.next")}
          </Button>
        </div>
      )}
      {!!scene.warnings.length && (
        <div className="xm-warning" role="status" aria-label={t("xmind.approximate")}
          title={t("xmind.approximate")}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" />
            <path d="M8 7v4" stroke="currentColor" /><circle cx="8" cy="4.5" r=".8" fill="currentColor" />
          </svg>
        </div>
      )}
      {context && (
        <div
          className="xm-context"
          role="menu"
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
            disabled={!selected.length}
            onClick={() => act(() => toggleFold(selected[0]))}
          >
            {t("xmind.fold")}
          </Button>
          <Button onClick={() => act(onInspect)}>{t("xmind.inspector")}</Button>
          <Button onClick={() => act(fit)}>{t("xmind.fit")}</Button>
          <Button onClick={() => setContext(null)}>{t("common.close")}</Button>
        </div>
      )}
    </div>
  );
}
