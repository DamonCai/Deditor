import { $markSchema, $nodeSchema, $remark, $inputRule } from "@milkdown/kit/utils";
import { remarkMark } from "remark-mark-highlight";
import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { remarkGFMPlugin, strikethroughSchema } from "@milkdown/kit/preset/gfm";
import { markRule } from "@milkdown/kit/prose";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import type { Ctx } from "@milkdown/kit/ctx";
import { remarkShorthand, emojiValue } from "../markdownShorthand";

export const shorthandRemark = $remark("deditorShorthand", () => remarkShorthand);
export const highlightRemark = $remark("deditorHighlight", () => remarkMark);
export const shorthandMarks = ([ ["mark", "mark", "=="], ["subscript", "sub", "~"], ["superscript", "sup", "^"] ] as const).map(([name, tag]) =>
  $markSchema(`deditor_${name}`, () => ({
    toDOM: () => [tag, 0],
    parseMarkdown: { match: n => n.type === name, runner: (state, node, type) => { state.openMark(type).next(node.children).closeMark(type); } },
    toMarkdown: { match: mark => mark.type.name === `deditor_${name}`, runner: (state, mark) => { state.withMark(mark, name); } },
  })));
export const emojiSchema = $nodeSchema("deditor_emoji", () => ({
  inline: true, group: "inline", atom: true, attrs: { name: { default: "", validate: "string" } },
  toDOM: node => ["span", { "data-md-emoji": node.attrs.name, title: `:${node.attrs.name}:` }, emojiValue(node.attrs.name) ?? `:${node.attrs.name}:`],
  parseDOM: [{ tag: "span[data-md-emoji]", getAttrs: dom => emojiValue(dom.dataset.mdEmoji ?? "") ? { name: dom.dataset.mdEmoji } : false }],
  parseMarkdown: { match: n => n.type === "deditorEmoji", runner: (state, node, type) => { state.addNode(type, { name: node.name }); } },
  toMarkdown: { match: node => node.type.name === "deditor_emoji", runner: (state, node) => { state.addNode("deditorEmoji", undefined, undefined, { name: node.attrs.name }); } },
}));
export const shorthandInputRules = [
  ...shorthandMarks.map((schema, i) => $inputRule(ctx => markRule([
    /(?<![\\=])(==)(\S(?:.*?\S)?)==$/,
    /(?<![\\~])(~)([^~\s]+)~$/,
    /(?<![\\^])(\^)([^\^\s]+)\^$/,
  ][i], schema.type(ctx)))),
  $inputRule(ctx => markRule(/(?<![\\~])(~~)(.+?)~~$/, strikethroughSchema.type(ctx))),
  $inputRule(ctx => new InputRule(/:([\w+-]+):$/, (state, match, start, end) => {
    if (!emojiValue(match[1]) || state.doc.textBetween(Math.max(0, start - 1), start) === "\\") return null;
    return state.tr.replaceWith(start, end, emojiSchema.type(ctx).create({ name: match[1] }));
  })),
];
export function configureShorthand(ctx: Ctx) {
  ctx.update(remarkGFMPlugin.options.key, options => ({ ...options, singleTilde: false }));
  ctx.update(remarkStringifyOptionsCtx, options => ({ ...options, handlers: { ...options.handlers,
    subscript: (node: { children: { value: string }[] }) => "~" + node.children.map(n => n.value).join("").replace(/[\\~\s|]/g, c => `\\${c}`) + "~",
    superscript: (node: { children: { value: string }[] }) => "^" + node.children.map(n => n.value).join("").replace(/[\\^\s|]/g, c => `\\${c}`) + "^",
    deditorEmoji: (node: { name: string }) => `:${node.name}:`,
  } }));
}
