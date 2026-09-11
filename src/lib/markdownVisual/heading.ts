import { $inputRule, $prose } from "@milkdown/kit/utils";
import { headingSchema } from "@milkdown/kit/preset/commonmark";
import { textblockTypeInputRule } from "@milkdown/kit/prose/inputrules";
import { Plugin, TextSelection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";

/** View-only hint: moving the caret must not alter source or undo history. */
export const activeHeadingHint = $prose(() => new Plugin({
  props: {
    decorations(state) {
      const { selection } = state;
      if (!(selection instanceof TextSelection) || !selection.empty) return DecorationSet.empty;
      const { $head } = selection;
      if ($head.parent.type.name !== "heading") return DecorationSet.empty;
      const from = $head.before();
      return DecorationSet.create(state.doc, [Decoration.node(from, from + $head.parent.nodeSize, {
        class: "md-heading-active",
      })]);
    },
  },
}));

/** Authored hashes specify an absolute level, never an increment of a hidden level. */
export const absoluteHeadingInputRule = $inputRule(ctx => textblockTypeInputRule(
  /^(#{1,6}) $/,
  headingSchema.type(ctx),
  match => ({ level: match[1].length }),
));
