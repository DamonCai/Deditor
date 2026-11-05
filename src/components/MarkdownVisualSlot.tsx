import { lazy, memo, Suspense, useEffect, useRef } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useEditorStore } from "../store/editor";
import MarkdownVisualFrame from "./MarkdownVisualFrame";
import { visualViewCost } from "../lib/retainedVisualTabs";

const MarkdownVisualContent = lazy(async () => {
  const { default: Editor } = await import("./MarkdownVisualEditor");
  return { default: function MarkdownVisualContent({ isolated, ...props }: Parameters<typeof Editor>[0] & { isolated: boolean }) {
    const editor = <Editor {...props} />;
    return isolated ? <MarkdownVisualFrame active={props.active ?? true}>{editor}</MarkdownVisualFrame> : editor;
  } };
});
const FRAME_MIN_LENGTH = 48 * 1024;
export const supportsRetainedVisualFrames = () =>
  /Macintosh.*AppleWebKit/.test(navigator.userAgent) && isTauri();

/** Keep a visited document's visual projection across mode switches.
 * The host bounds retained slots; source-only documents never load it. */
const MarkdownVisualSlot = memo(function MarkdownVisualSlot({ tabId, active, focused = true, theme, measure }: {
  tabId: string; active: boolean; focused?: boolean; theme: "light" | "dark";
  measure?: (id: string, bytes: number | undefined) => void;
}) {
  const visited = useRef(false);
  const useFrame = useRef(false);
  const slot = useRef<HTMLDivElement>(null);
  const long = useEditorStore(s => (s.tabs.find(tab => tab.id === tabId)?.content.length ?? 0) >= FRAME_MIN_LENGTH);
  if (active && !visited.current) {
    visited.current = true;
    useFrame.current = long && supportsRetainedVisualFrames();
  }
  useEffect(() => {
    if (active || !measure || !useFrame.current) return;
    const frame = slot.current?.querySelector<HTMLIFrameElement>("iframe.md-visual-frame");
    const owner = frame?.contentDocument;
    if (!frame || !owner) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const measureView = () => {
      const view = owner.querySelector(".ProseMirror");
      // Keep authored players and pages on the original retention schedule.
      if (!view || frame.hasAttribute("data-editor-frame-media") || view.querySelector("iframe, video, audio, object, embed")) {
        measure(tabId, undefined);
        return;
      }
      let imageBytes = 0;
      for (const image of view.querySelectorAll("img")) {
        if (!image.complete && image.loading !== "lazy") { measure(tabId, undefined); return; }
        imageBytes += image.naturalWidth * image.naturalHeight * 4;
      }
      const length = useEditorStore.getState().tabs.find(tab => tab.id === tabId)?.content.length ?? 0;
      measure(tabId, visualViewCost(length, view.querySelectorAll("*").length, imageBytes));
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(measureView, 50);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(frame, { attributes: true, attributeFilter: ["data-editor-frame-media"] });
    owner.addEventListener("load", schedule, true);
    owner.addEventListener("error", schedule, true);
    measureView();
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      owner.removeEventListener("load", schedule, true);
      owner.removeEventListener("error", schedule, true);
    };
  }, [active, measure, tabId]);
  // React 18 forwards inert as a string attribute. Commit it with the
  // visibility state before handing keyboard focus to the destination.
  return <div ref={slot} className="md-visual-slot" {...{ inert: active ? undefined : "" }} aria-hidden={!active}>
    {visited.current && <Suspense fallback={null}><MarkdownVisualContent tabId={tabId} active={active} focused={focused} theme={theme} isolated={useFrame.current} /></Suspense>}
  </div>;
});

export default MarkdownVisualSlot;
