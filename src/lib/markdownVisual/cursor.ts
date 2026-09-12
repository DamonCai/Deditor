import { $prose } from "@milkdown/kit/utils";
import { Plugin, TextSelection, type EditorState } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { createVirtualCursor } from "prosemirror-virtual-cursor";

function terminalHtml(state: EditorState, pos = state.selection.head) {
  const $pos = state.doc.resolve(pos);
  if (!$pos.parent.isTextblock || $pos.parentOffset !== $pos.parent.content.size ||
      !$pos.nodeBefore?.marks.some(mark => /^deditor_(html|color|background|underline|sup|sub)$/.test(mark.type.name))) return null;
  return $pos;
}

/** Keep mark-boundary navigation while the browser draws its native caret. */
export const nativeMarkdownCursor = $prose(() => {
  const affinity = createVirtualCursor({ skipWarning: true });
  // The same model position can be inside the final HTML mark or just after it.
  // Draw the native caret after its DOM wrapper when typing has left that mark.
  const drawOutside = (view: EditorView) => {
    if (!view.hasFocus() || view.composing || !view.state.selection.empty || view.state.storedMarks?.length !== 0) return;
    const $pos = terminalHtml(view.state); if (!$pos) return;
    const block = view.nodeDOM($pos.before());
    if (!(block instanceof HTMLElement)) return;
    const anchor = block.querySelector("[data-md-mark-boundary]");
    if (!anchor) return;
    const offset = Array.prototype.indexOf.call(block.childNodes, anchor) + 1;
    const selection = view.dom.ownerDocument.getSelection();
    if (selection?.anchorNode !== block || selection.anchorOffset !== offset) selection?.collapse(block, offset);
  };
  return new Plugin({
    props: {
      decorations(state) {
        if (!state.selection.empty || state.storedMarks?.length !== 0 || !terminalHtml(state)) return null;
        // Browsers otherwise paint even a parent-DOM caret inside the last
        // padded inline element. This zero-width view-only anchor gives the
        // native caret an actual outside edge; it never enters Markdown.
        return DecorationSet.create(state.doc, [Decoration.widget(state.selection.head, () => {
          const anchor = document.createElement("span");
          anchor.dataset.mdMarkBoundary = "true"; anchor.setAttribute("aria-hidden", "true");
          anchor.textContent = "\u200b";
          return anchor;
        }, { key: "md-terminal-html-boundary", side: -1, marks: [] })]);
      },
      handleKeyDown(view, event) {
        if (view.editable && !view.composing && !event.isComposing && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey &&
            view.state.selection instanceof TextSelection && view.state.selection.empty) {
          const $pos = terminalHtml(view.state);
          if ($pos) {
            const marks = view.state.storedMarks ?? $pos.marks();
            if (event.key === "ArrowRight" && marks.length) {
              view.dispatch(view.state.tr.setStoredMarks([])); return true;
            }
            if (event.key === "ArrowLeft" && !marks.length) {
              view.dispatch(view.state.tr.setStoredMarks($pos.nodeBefore!.marks)); return true;
            }
          }
        }
        return affinity.props.handleKeyDown?.call(affinity, view, event) ?? false;
      },
      handleClick(view, pos, event) {
        if (!view.editable || view.composing || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
        const $pos = terminalHtml(view.state, pos); if (!$pos) return false;
        const block = view.nodeDOM($pos.before());
        const last = block?.lastChild;
        if (!(last instanceof HTMLElement)) return false;
        const rect = last.getBoundingClientRect();
        // A click inside the key cap keeps editing it; blank space after it
        // selects the outside affinity without inserting a spacer into source.
        if (event.clientX < rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return false;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)).setStoredMarks([]));
        view.focus(); drawOutside(view); return true;
      },
    },
    view: () => ({ update: drawOutside }),
  });
});
