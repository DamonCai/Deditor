import { addTimer } from "@milkdown/kit/utils";
import { editorViewOptionsCtx, editorViewTimerCtx, nodeViewCtx } from "@milkdown/kit/core";
import type { NodeViewConstructor } from "@milkdown/kit/prose/view";

/** Install the final factories before ProseMirror builds the document DOM.
 * Replacing them after create() rebuilds every NodeView, including all tables.
 * Wait for the ordinary view dependencies first so every feature has registered
 * its factory; the editor view also waits for this setup's own timer. */
export function initialNodeViews(build: (originals: Record<string, NodeViewConstructor>) => Record<string, NodeViewConstructor>) {
  return addTimer(async (ctx, plugin) => {
    await Promise.all(ctx.get(editorViewTimerCtx).filter(timer => timer !== plugin.timer).map(timer => ctx.wait(timer)));
    const originals = { ...Object.fromEntries(ctx.get(nodeViewCtx)), ...ctx.get(editorViewOptionsCtx).nodeViews };
    ctx.update(editorViewOptionsCtx, options => ({ ...options, nodeViews: build(originals) }));
  }, editorViewTimerCtx);
}
