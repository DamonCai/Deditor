import { useEffect, useRef } from "react";
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
import { saveFile } from "../lib/fileio";

interface Props {
  sheet: XmindSheet;
  readonly: boolean;
  originalDataUrl: string;
  tabId?: string;
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
export default function XmindCanvas({ sheet, readonly, originalDataUrl, tabId }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const meRef = useRef<MindElixirInstance | null>(null);
  const flushTimer = useRef<number | null>(null);
  // Snapshot the structureClass we started with so we can preserve the *exact*
  // string (e.g. "org.xmind.ui.brace.right") when the user hasn't changed
  // direction. mind-elixir only knows RIGHT/LEFT/SIDE; round-tripping through
  // it would otherwise turn brace.* into logic.* and lose the brace style.
  const initialStructureClass = useRef<string | undefined>(undefined);
  const initialDirection = useRef<number>(0);

  useEffect(() => {
    if (!hostRef.current) return;

    const data = { nodeData: topicToMENode(sheet.rootTopic) };
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
    const bus = (me as unknown as {
      bus?: { addListener: (e: string, fn: () => void) => void };
    }).bus;
    if (bus?.addListener) bus.addListener("operation", scheduleFlush);

    // Capture-phase Cmd/Ctrl+S so mind-elixir's keypress handler can't
    // swallow it. We sync-flush latest state into tab.content, then run
    // saveFile() — which reads from the (now-fresh) store and writes to disk.
    const onKeyCapture = (e: KeyboardEvent) => {
      const isSave =
        (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === "s" || e.key === "S");
      if (!isSave) return;
      e.preventDefault();
      e.stopPropagation();
      forceFlush();
      saveFile().catch((err) => logError("xmind save failed", err));
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
}

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
