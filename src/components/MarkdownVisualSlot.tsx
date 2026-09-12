import { lazy, Suspense, useRef } from "react";
const MarkdownVisualEditor = lazy(() => import("./MarkdownVisualEditor"));

/** Keep only the current document's visual projection across mode switches.
 * A tab change unmounts this keyed slot; source-only documents never load it. */
export default function MarkdownVisualSlot({ tabId, active, theme }: { tabId: string; active: boolean; theme: "light" | "dark" }) {
  const visited = useRef(false);
  if (active) visited.current = true;
  return <div ref={element => { if (element) element.inert = !active; }} style={{ display: active ? "block" : "none", flex: "1 1 0", minWidth: 0, height: "100%" }} aria-hidden={!active}>
    {visited.current && <Suspense fallback={null}><MarkdownVisualEditor tabId={tabId} active={active} theme={theme} /></Suspense>}
  </div>;
}
