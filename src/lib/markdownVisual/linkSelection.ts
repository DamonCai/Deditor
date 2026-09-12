import type { Ctx } from "@milkdown/kit/ctx";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { SelectionBookmark } from "@milkdown/kit/prose/state";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { linkTooltipAPI, linkTooltipState } from "@milkdown/kit/component/link-tooltip";

/** The link popup selects its entire label internally; closing restores the user's caret. */
export function installLinkSelection(ctx: Ctx, view: EditorView, boundary: () => void, isActive: () => boolean) {
  const api = ctx.get(linkTooltipAPI.key), state = ctx.use(linkTooltipState.key);
  let saved: { bookmark: SelectionBookmark; doc: ProseNode } | null = null;
  let disposed = false;
  const editLink: typeof api.editLink = (...args) => {
    saved = { bookmark: view.state.selection.getBookmark(), doc: view.state.doc };
    boundary();
    api.editLink(...args);
  };
  ctx.update(linkTooltipAPI.key, current => ({ ...current, editLink }));
  const changed = ({ mode }: { mode: string }) => {
    if (mode !== "preview" || !saved) return;
    const previous = saved; saved = null;
    // The upstream callback may run while plugin views are updating.
    queueMicrotask(() => {
      if (disposed || view.isDestroyed || !isActive()) return;
      const current = view.state.doc;
      if (current.content.size !== previous.doc.content.size || current.textContent !== previous.doc.textContent) return;
      view.dispatch(view.state.tr.setSelection(previous.bookmark.resolve(current)).setMeta("addToHistory", false));
      boundary();
    });
  };
  state.on(changed);
  return () => {
    disposed = true; saved = null;
    state.off(changed);
    if (ctx.get(linkTooltipAPI.key).editLink === editLink) ctx.update(linkTooltipAPI.key, current => ({ ...current, editLink: api.editLink }));
  };
}
