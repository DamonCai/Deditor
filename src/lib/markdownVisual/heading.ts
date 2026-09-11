import { $inputRule } from "@milkdown/kit/utils";
import { headingSchema } from "@milkdown/kit/preset/commonmark";
import { textblockTypeInputRule } from "@milkdown/kit/prose/inputrules";

/** Authored hashes specify an absolute level, never an increment of a hidden level. */
export const absoluteHeadingInputRule = $inputRule(ctx => textblockTypeInputRule(
  /^(#{1,6}) $/,
  headingSchema.type(ctx),
  match => ({ level: match[1].length }),
));
