import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import MindElixir from "mind-elixir";
import "mind-elixir/style.css";
import type { XmindSheet } from "../lib/xmind/parse";
import { dataUrlToBytes } from "../lib/xmind/parse";
import { structureToDirection } from "../lib/xmind/layout";
import {
  topicToMENode,
  saveSheetEdit,
  bytesToXmindDataUrl,
  type MENode,
} from "../lib/xmind/edit";
import { logError } from "../lib/logger";
import { useEditorStore } from "../store/editor";
import { saveFile, closeActiveTab } from "../lib/fileio";

interface Props {
  sheet: XmindSheet;
  readonly: boolean;
  originalDataUrl: string;
  tabId?: string;
}

export interface XmindCanvasHandle {
  /** Append a new floating topic to root and trigger a save flush. No-op in
   *  read mode or if mind-elixir hasn't mounted yet. */
  addDetachedTopic: () => void;
}

/** Single rendering surface for both Read and Edit. mind-elixir handles both;
 *  read mode just disables editing, dragging, context menu, keypress.
 *
 *  Save flow (edit only):
 *   - mind-elixir 'operation' bus event → 400ms debounce → flush()
 *   - Cmd+S in capture phase → forceFlush() → saveFile() (sync sequence so the
 *     save reads the freshly-flushed tab content)
 *   - flush() reads mind-elixir's live direction and writes it back as the
 *     root topic's structureClass, so direction changes survive the save and
 *     show up correctly when you switch back to Read mode. */
const XmindCanvas = forwardRef<XmindCanvasHandle, Props>(function XmindCanvas(
  { sheet, readonly, originalDataUrl, tabId }, ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const meRef = useRef<MindElixirInstance | null>(null);
  const flushTimer = useRef<number | null>(null);
  // Imperative methods that need access to closures created inside useEffect
  // (flush, mind-elixir refresh) live behind a ref that the effect populates.
  const addDetachedRef = useRef<() => void>(() => {});
  // Snapshot the structureClass we started with so we can preserve the *exact*
  // string (e.g. "org.xmind.ui.brace.right") when the user hasn't changed
  // direction. mind-elixir only knows RIGHT/LEFT/SIDE; round-tripping through
  // it would otherwise turn brace.* into logic.* and lose the brace style.
  const initialStructureClass = useRef<string | undefined>(undefined);
  const initialDirection = useRef<number>(0);

  useImperativeHandle(ref, () => ({
    addDetachedTopic: () => addDetachedRef.current(),
  }), []);

  useEffect(() => {
    if (!hostRef.current) return;

    const data = { nodeData: topicToMENode(sheet.rootTopic, true) };
    const direction = structureToDirection(sheet.rootTopic.structureClass);
    const meDirection =
      direction === "left" ? MindElixir.LEFT
      : direction === "side" ? MindElixir.SIDE
      : MindElixir.RIGHT;

    initialStructureClass.current = sheet.rootTopic.structureClass;
    initialDirection.current = meDirection;

    const me = new MindElixir({
      el: hostRef.current,
      direction: meDirection,
      draggable: !readonly,
      contextMenu: !readonly,
      toolBar: true,
      keypress: !readonly,
      editable: !readonly,
    } as unknown as ConstructorParameters<typeof MindElixir>[0]);
    me.init(data as unknown as Parameters<typeof me.init>[0]);
    meRef.current = me as unknown as MindElixirInstance;

    // After every layout, clear the stroke on the main-branch line that runs
    // from root to a detached top-level topic. mind-elixir paints one path
    // per `me-main > me-wrapper` in DOM order into `inst.lines`, so wrapper
    // index === path index. We can't use branchColor for this — that color
    // cascades to descendants and would also blank out the floating subtree's
    // own internal connectors.
    const bus = (me as unknown as {
      bus?: { addListener: (e: string, fn: () => void) => void };
    }).bus;
    const hideDetachedRootLines = () => {
      const inst = meRef.current as unknown as {
        map?: HTMLElement;
        lines?: SVGElement;
      } | null;
      if (!inst?.map || !inst?.lines) return;
      const wrappers = inst.map.querySelectorAll("me-main > me-wrapper");
      const paths = inst.lines.children;
      for (let i = 0; i < wrappers.length; i++) {
        const tpc = wrappers[i].querySelector("me-tpc") as
          | (Element & { nodeObj?: MENode })
          | null;
        if (tpc?.nodeObj?._xmind?.detachedRoot && paths[i]) {
          (paths[i] as SVGElement).setAttribute("stroke", "transparent");
        }
      }
    };
    if (bus?.addListener) bus.addListener("linkDiv", hideDetachedRootLines);
    hideDetachedRootLines();

    if (readonly || !tabId) {
      return () => { if (hostRef.current) hostRef.current.innerHTML = ""; meRef.current = null; };
    }

    // ---- edit-mode wiring ----

    const flush = () => {
      const inst = meRef.current;
      if (!inst) return;
      try {
        const live = inst.getData() as { nodeData?: MENode } | undefined;
        if (!live?.nodeData) return;
        // Stamp current direction onto the root's _xmind sidecar so it round-
        // trips into structureClass on save.
        const liveDir = inst.direction;
        const sc =
          liveDir === initialDirection.current
            ? initialStructureClass.current
            : directionToStructureClass(liveDir);
        const root = live.nodeData;
        if (sc) {
          root._xmind = { ...(root._xmind ?? {}), structureClass: sc };
        }
        const bytes = saveSheetEdit(
          dataUrlToBytes(originalDataUrl),
          sheet.id,
          root,
        );
        useEditorStore.getState().setContent(bytesToXmindDataUrl(bytes), tabId);
      } catch (e) {
        logError("xmind edit flush failed", e);
      }
    };

    const scheduleFlush = () => {
      if (flushTimer.current != null) return;
      flushTimer.current = window.setTimeout(() => {
        flushTimer.current = null;
        flush();
      }, 400);
    };

    const forceFlush = () => {
      if (flushTimer.current != null) {
        window.clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      flush();
    };

    // mind-elixir emits "operation" on every structural / textual edit.
    if (bus?.addListener) bus.addListener("operation", scheduleFlush);

    addDetachedRef.current = () => {
      const inst = meRef.current as unknown as {
        map: HTMLElement;
        direction: number;
        addChild: (el: Element, node: MENode) => void;
        getData: () => { nodeData: MENode };
      } | null;
      if (!inst) return;
      const rootTpc = inst.map.querySelector("me-root me-tpc");
      if (!rootTpc) return;
      // Stagger y so multiple new floating topics don't pile up when XMind
      // re-opens. Initial x sign matches mind-elixir's global direction;
      // SIDE mode auto-balances per-node and is corrected after addChild.
      const live = inst.getData();
      const existingDetached = (live.nodeData.children ?? []).filter(
        (c) => c._xmind?.detachedRoot,
      ).length;
      const y = 200 + existingDetached * 80;
      const initialX = inst.direction === MindElixir.LEFT ? -150 : 150;
      const newNode: MENode = {
        id: crypto.randomUUID().replace(/-/g, ""),
        topic: "自由主题",
        _xmind: {
          detachedRoot: true,
          position: { x: initialX, y },
        },
      };
      // addChild fires linkDiv (→ hideDetachedRootLines) + operation
      // (→ scheduleFlush) and preserves mind-elixir's undo stack. In SIDE
      // mode it auto-balances and writes the chosen side onto newNode.direction.
      inst.addChild(rootTpc, newNode);
      if (newNode._xmind?.position) {
        const wantNeg =
          newNode.direction === 0 ||
          (newNode.direction === undefined && inst.direction === MindElixir.LEFT);
        const x = wantNeg ? -150 : 150;
        newNode._xmind.position = { x, y };
      }
      forceFlush();
    };

    // mind-elixir's keypress handler preventDefaults every key except Cmd+CVX,
    // which suppresses the OS menu accelerators for Cmd+S (save) and Cmd+W
    // (close tab). Capture-phase intercept restores both.
    const onKeyCapture = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta || e.shiftKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "s") {
        e.preventDefault();
        e.stopPropagation();
        forceFlush();
        saveFile().catch((err) => logError("xmind save failed", err));
      } else if (k === "w") {
        e.preventDefault();
        e.stopPropagation();
        closeActiveTab().catch((err) => logError("xmind close tab failed", err));
      }
    };
    window.addEventListener("keydown", onKeyCapture, true);

    return () => {
      window.removeEventListener("keydown", onKeyCapture, true);
      if (flushTimer.current != null) {
        window.clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      // Best-effort final flush so a sub-400ms-old edit doesn't get lost on
      // unmount (e.g. switching tabs while an edit is pending).
      flush();
      if (hostRef.current) hostRef.current.innerHTML = "";
      meRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet.id, readonly]);

  return (
    <div className="relative flex-1 min-h-0" style={{ background: "var(--bg)", overflow: "hidden" }}>
      <div ref={hostRef} className="absolute inset-0" style={{ overflow: "hidden" }} />
    </div>
  );
});

export default XmindCanvas;

/** Reverse mapping: mind-elixir's direction enum → an XMind structureClass.
 *  Used only when the user actually toggled direction in the toolbar; if they
 *  didn't, we preserve the original (incl. brace.* / etc. that ME doesn't model). */
function directionToStructureClass(d: number): string {
  if (d === MindElixir.LEFT) return "org.xmind.ui.logic.left";
  if (d === MindElixir.SIDE) return "org.xmind.ui.map.unbalanced";
  return "org.xmind.ui.logic.right";
}

/** Minimal slice of MindElixir's runtime instance we touch. The lib's own
 *  types are rough; pinning what we use keeps the call sites honest. */
interface MindElixirInstance {
  getData(): unknown;
  direction: number;
}
