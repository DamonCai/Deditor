import { $prose } from "@milkdown/kit/utils";
import { Plugin, TextSelection } from "@milkdown/kit/prose/state";

/** Match ProseMirror's cross-block keypress handling for non-keyboard insertText. */
export const markdownCrossBlockInput = $prose(() => new Plugin({
  props: {
    handleDOMEvents: {
      beforeinput(view, event) {
        const input = event as InputEvent;
        if (!view.editable || view.composing || input.isComposing || !input.cancelable || input.defaultPrevented
          || input.inputType !== "insertText" || !input.data || /[\r\n]/.test(input.data)) return false;
        const selection = view.state.selection;
        if (!(selection instanceof TextSelection) || selection.$from.sameParent(selection.$to)) return false;
        for (const endpoint of [selection.$from, selection.$to]) {
          if (!endpoint.parent.isTextblock) return false;
          for (let depth = endpoint.depth; depth > 0; depth--) {
            const node = endpoint.node(depth);
            if (node.type.spec.code || /raw|inline_source/.test(node.type.name)) return false;
          }
        }
        const insert = () => view.state.tr.insertText(input.data!).scrollIntoView();
        // A handled keypress is already prevented by ProseMirror and generates
        // no beforeinput. Preserve its normal input handlers on this other path.
        if (!view.someProp("handleTextInput", handler => handler(view, selection.from, selection.to, input.data!, insert))) view.dispatch(insert());
        input.preventDefault();
        return true;
      },
    },
  },
}));
