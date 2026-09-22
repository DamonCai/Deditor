import type { Ctx } from "@milkdown/kit/ctx";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { SelectionBookmark } from "@milkdown/kit/prose/state";
import type { Mark, Node as ProseNode } from "@milkdown/kit/prose/model";
import { linkTooltipAPI, linkTooltipState } from "@milkdown/kit/component/link-tooltip";

/** The link popup selects its entire label internally; closing restores the user's caret. */
export function installLinkSelection(ctx: Ctx, view: EditorView, boundary: () => void, isActive: () => boolean) {
  const api = ctx.get(linkTooltipAPI.key), state = ctx.use(linkTooltipState.key);
  let saved: { bookmark: SelectionBookmark; doc: ProseNode; mark: Mark; from: number; to: number; confirmed?: boolean; submittedFile?: string } | null = null;
  let disposed = false;
  const host = view.dom.parentElement ?? view.dom;
  const captureConfirmation = (event: Event) => {
    if (!saved || !isActive() || !view.editable || !(event.target instanceof Element)) return;
    if (event.type === "keydown" && ((event as KeyboardEvent).key !== "Enter" || (event as KeyboardEvent).isComposing)) return;
    if (event.type === "pointerdown" && !event.target.closest(".confirm")) return;
    const popup = event.target.closest(".milkdown-link-edit");
    if (!popup || !host.contains(popup)) return;
    saved.confirmed = true;
    const href = popup.querySelector<HTMLInputElement>("input")?.value.trim();
    // Milkdown intentionally strips file: in its generic web editor. DEditor's
    // own link schema and opener already support local files. Capture only an
    // explicit confirmation of that supported protocol, never a canceled draft.
    try { if (href && new URL(href).protocol === "file:") saved.submittedFile = href; } catch { /* Keep upstream validation for other input. */ }
  };
  host.addEventListener("keydown", captureConfirmation, true);
  host.addEventListener("pointerdown", captureConfirmation, true);
  const editLink: typeof api.editLink = (...args) => {
    saved = { bookmark: view.state.selection.getBookmark(), doc: view.state.doc, mark: args[0], from: args[1], to: args[2] };
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
      const tr = view.state.tr;
      // The popup edits only href, but its upstream command recreates the mark
      // with schema defaults, dropping an authored title. Keep the other attrs
      // while the label/range are unchanged; removal still leaves no link.
      const link = current.nodeAt(previous.from)?.marks.find(mark => mark.type === previous.mark.type);
      if (previous.confirmed && link && (link.attrs.href !== previous.mark.attrs.href || previous.submittedFile)) {
        const preserved = link.type.create({ ...previous.mark.attrs, href: previous.submittedFile ?? link.attrs.href });
        if (!link.eq(preserved)) tr.addMark(previous.from, previous.to, preserved);
      }
      view.dispatch(tr.setSelection(previous.bookmark.resolve(tr.doc)).setMeta("addToHistory", false));
      boundary();
    });
  };
  state.on(changed);
  return () => {
    disposed = true; saved = null;
    host.removeEventListener("keydown", captureConfirmation, true);
    host.removeEventListener("pointerdown", captureConfirmation, true);
    state.off(changed);
    if (ctx.get(linkTooltipAPI.key).editLink === editLink) ctx.update(linkTooltipAPI.key, current => ({ ...current, editLink: api.editLink }));
  };
}
