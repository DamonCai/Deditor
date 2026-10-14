import { useEffect, useRef, useState } from "react";
import type { Command, Group, Topic } from "../lib/xmind/document";
import type { SceneGroup, SceneNode } from "../lib/xmind/scene";
import type { Point } from "../lib/xmind/relationship";
import {
  groupRange,
  groupRangeBounds,
  groupRangeReversed,
  nearestGroupMember,
} from "../lib/xmind/groupRange";
import { useT } from "../lib/i18n";

export default function XmindGroupHandles({
  group,
  box,
  owner,
  nodes,
  zoom,
  axis,
  toWorld,
  onCommand,
}: {
  group: Group;
  box: SceneGroup;
  owner: Topic;
  nodes: readonly SceneNode[];
  zoom: number;
  axis: "x" | "y";
  toWorld: (x: number, y: number) => Point;
  onCommand: (command: Command) => void;
}) {
  const t = useT(),
    range = groupRange(group);
  const drag = useRef<{ which: "start" | "end"; moved: boolean } | null>(null);
  const [preview, setPreview] = useState<{ start: number; end: number } | null>(
    null,
  );
  const cancel = () => {
    drag.current = null;
    setPreview(null);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing && e.keyCode !== 229) cancel();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", cancel);
    };
  }, []);
  if (!range) return null;
  const reversed = groupRangeReversed(owner, nodes, axis, range);
  const bounds = preview
    ? (groupRangeBounds(owner, preview.start, preview.end, nodes) ?? box)
    : box;
  const at = (which: "start" | "end", x: number, y: number) => {
    const point = toWorld(x, y),
      index = nearestGroupMember(owner, nodes, axis, point[axis], point[axis === "x" ? "y" : "x"]);
    if (index === null) return range;
    return which === "start"
      ? { start: Math.min(index, range.end), end: range.end }
      : { start: range.start, end: Math.max(index, range.start) };
  };
  return (
    <g data-group-handles={group.id} onPointerDown={(e) => e.stopPropagation()}>
      {preview && (
        <rect
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
          rx={12}
          fill="none"
          stroke="#299AD8"
          strokeWidth={2 / zoom}
          strokeDasharray={`${5 / zoom} ${3 / zoom}`}
          pointerEvents="none"
        />
      )}
      {(["start", "end"] as const).map((which) => {
        const high = (which === "end") !== reversed;
        const x =
          axis === "x"
            ? bounds.x + (high ? bounds.width : 0)
            : !high && box.titleLines.length
              ? bounds.x + Math.min(14 / zoom, bounds.width / 4)
              : bounds.x + bounds.width / 2;
        const y =
          axis === "y"
            ? bounds.y + (high ? bounds.height : 0)
            : bounds.y + bounds.height / 2;
        return (
          <circle
            key={which}
            data-range-handle={which}
            aria-label={t(
              which === "start" ? "xmind.rangeStart" : "xmind.rangeEnd",
            )}
            cx={x}
            cy={y}
            r={5 / zoom}
            stroke="#fff"
            strokeWidth={1.5 / zoom}
            fill="#299AD8"
            style={{ cursor: axis === "x" ? "ew-resize" : "ns-resize" }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              drag.current = { which, moved: false };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              drag.current.moved = true;
              setPreview(at(which, e.clientX, e.clientY));
            }}
            onPointerUp={(e) => {
              if (drag.current?.moved)
                onCommand({
                  type: "group-update",
                  parent: owner.id,
                  id: group.id,
                  range: at(which, e.clientX, e.clientY),
                });
              cancel();
            }}
            onPointerCancel={cancel}
            onLostPointerCapture={cancel}
          />
        );
      })}
    </g>
  );
}
