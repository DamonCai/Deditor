import { lazy, memo, Suspense, useRef } from "react";
const MarkdownVisualEditor = lazy(() => import("./MarkdownVisualEditor"));

/** Keep a visited document's visual projection across mode switches.
 * The host bounds retained slots; source-only documents never load it. */
const MarkdownVisualSlot = memo(function MarkdownVisualSlot({ tabId, active, focused = true, theme }: { tabId: string; active: boolean; focused?: boolean; theme: "light" | "dark" }) {
  const visited = useRef(false);
  if (active) visited.current = true;
  // React 18 forwards inert as a string attribute. Commit it together with
  // display so restoring focus doesn't lay out the document between writes.
  return <div {...{ inert: active ? undefined : "" }} style={{ display: active ? "block" : "none", flex: "1 1 0", minWidth: 0, height: "100%" }} aria-hidden={!active}>
    {visited.current && <Suspense fallback={null}><MarkdownVisualEditor tabId={tabId} active={active} focused={focused} theme={theme} /></Suspense>}
  </div>;
});

export default MarkdownVisualSlot;
