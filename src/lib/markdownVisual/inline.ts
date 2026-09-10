import { $markSchema } from "@milkdown/kit/utils";
import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import type { SourceNode } from "./document";
const tags: Record<string, string> = { deditor_underline: "u", deditor_sup: "sup", deditor_sub: "sub" };
const kinds = ["deditor_color", "deditor_background", ...Object.keys(tags)];
function opening(kind: string, color: string) {
  return tags[kind] ? `<${tags[kind]}>` : `<span style="${kind === "deditor_color" ? "color" : "background"}:${color}">`;
}
export function inlineHtmlMarks(tree: SourceNode) {
  if (!tree.children) return;
  tree.children.forEach(inlineHtmlMarks);
  const result: SourceNode[] = [];
  for (let i = 0; i < tree.children.length; i++) {
    const node = tree.children[i];
    if (node.type !== "html") { result.push(node); continue; }
    const color = node.value?.match(/^<span\s+style=["'](color|background(?:-color)?):\s*(#[\da-f]{6});?["']\s*>$/i);
    const tag = node.value?.match(/^<(u|sup|sub)>$/i)?.[1]?.toLowerCase();
    if (!color && !tag) { result.push(node); continue; }
    const close = tag ? `</${tag}>` : "</span>";
    let end = i + 1;
    while (end < tree.children.length && !(tree.children[end].type === "html" && tree.children[end].value?.toLowerCase() === close)) end++;
    if (end === tree.children.length) { result.push(node); continue; }
    const type = tag ? Object.keys(tags).find(key => tags[key] === tag)! : color![1] === "color" ? "deditor_color" : "deditor_background";
    const mark: SourceNode = { type, value: color?.[2], children: tree.children.slice(i + 1, end), position: node.position && tree.children[end].position ? { start: node.position.start, end: tree.children[end].position!.end } : undefined };
    inlineHtmlMarks(mark); result.push(mark); i = end;
  }
  tree.children = result;
}
export const inlineSchemas = kinds.map(kind => $markSchema(kind, () => ({
  attrs: { color: { default: "#000000" } },
  parseDOM: tags[kind] ? [{ tag: tags[kind] }] : [{ tag: 'span[style]', getAttrs: (dom: HTMLElement) => {
    const color = kind === "deditor_color" ? dom.style.color : dom.style.backgroundColor;
    return color ? { color } : false;
  } }],
  toDOM: mark => tags[kind] ? [tags[kind], 0] : ["span", { style: `${kind === "deditor_color" ? "color" : "background"}:${mark.attrs.color}` }, 0],
  parseMarkdown: { match: n => n.type === kind, runner: (state, node, type) => { state.openMark(type, { color: node.value ?? "#000000" }); state.next(node.children); state.closeMark(type); } },
  toMarkdown: { match: mark => mark.type.name === kind, runner: (state, mark) => { state.withMark(mark, kind, undefined, { color: mark.attrs.color }); } },
})));
export function configureInlineSerialization(ctx: Ctx) {
  ctx.update(remarkStringifyOptionsCtx, prev => ({ ...prev, handlers: { ...prev.handlers,
    ...Object.fromEntries(kinds.map(kind => [kind, (node: { color: string }, _parent: unknown, state: { containerPhrasing: (node: unknown, info: unknown) => string }, info: unknown) => opening(kind, node.color) + state.containerPhrasing(node, info) + `</${tags[kind] ?? "span"}>`])),
  } }));
}
