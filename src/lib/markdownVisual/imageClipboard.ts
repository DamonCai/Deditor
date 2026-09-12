import { $prose } from "@milkdown/kit/utils";
import { Fragment, Slice } from "@milkdown/kit/prose/model";
import { Plugin, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

/** Keep an asynchronous bitmap paste attached to the selection that requested it. */
export function imageClipboard(upload: (file: File) => Promise<string>, enabled: () => boolean, breakGroup: () => void) {
  const pending = new Set<{ from: number; to: number }>();
  const cancel = () => pending.clear();
  const plugin = $prose(() => new Plugin({
    state: {
      init: () => null,
      apply: tr => {
        for (const target of pending) {
          // Editing the pending replacement cancels it, so a late upload cannot
          // remove prose typed while the image was being saved.
          for (const map of tr.mapping.maps) {
            let overlaps = false;
            map.forEach((from, to) => {
              if (target.from === target.to) overlaps ||= from < target.from && to > target.to;
              else overlaps ||= from < target.to && to > target.from;
            });
            if (overlaps) { pending.delete(target); break; }
            const collapsed = target.from === target.to;
            target.from = map.map(target.from, 1);
            target.to = map.map(target.to, collapsed ? 1 : -1);
          }
        }
        return null;
      },
    },
    view: view => {
      view.dom.addEventListener("deditor-image-paste-cancel", cancel);
      return { destroy: () => { cancel(); view.dom.removeEventListener("deditor-image-paste-cancel", cancel); } };
    },
  }));
  const paste = (view: EditorView, event: ClipboardEvent) => {
    const data = event.clipboardData;
    if (!enabled() || !view.editable || view.composing || view.state.selection.$from.parent.type.spec.code || data?.getData("text/html")) return false;
    const files = Array.from(data?.files ?? []).filter(file => file.type.startsWith("image/"));
    if (!files.length) return false;
    const target = { from: view.state.selection.from, to: view.state.selection.to };
    pending.add(target);
    void Promise.all(files.map(upload)).then(urls => {
      if (!pending.delete(target) || view.isDestroyed || !enabled()) return;
      const image = view.state.schema.nodes["image-block"];
      if (!image) return;
      breakGroup();
      const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, target.from, target.to));
      tr.replaceSelection(new Slice(Fragment.fromArray(urls.map(src => image.create({ src }))), 0, 0));
      view.dispatch(tr.setMeta("paste", true).setMeta("uiEvent", "paste"));
      breakGroup();
    }).catch(() => { pending.delete(target); }); // Upload already reports the storage error.
    return true;
  };
  return { plugin, paste };
}
