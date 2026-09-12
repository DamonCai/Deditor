import { paragraphSchema } from "@milkdown/kit/preset/commonmark";

/** A user-inserted terminal break must survive serialization before more typing. */
export const faithfulParagraph = paragraphSchema.extendSchema(previous => ctx => {
  const base = previous(ctx);
  return { ...base, toMarkdown: { ...base.toMarkdown, runner: (state, node) => {
    if (node.lastChild?.type.name !== "hardbreak" || node.lastChild.attrs.isInline) {
      base.toMarkdown.runner(state, node); return;
    }
    // A Markdown backslash break needs following text; <br> also survives at EOF.
    state.openNode("paragraph");
    state.next(node.content.cut(0, node.content.size - 1));
    state.addNode("html", undefined, "<br>");
    state.closeNode();
  } } };
});
