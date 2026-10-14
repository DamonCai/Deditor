import { $markSchema } from "@milkdown/kit/utils";
import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import type { SourceNode } from "./document";
const tags: Record<string, string> = { deditor_underline: "u", deditor_sup: "sup", deditor_sub: "sub" };
const kinds = ["deditor_color", "deditor_background", ...Object.keys(tags)];
const safeInlineTags = new Set(["span", "mark", "kbd", "b", "strong", "i", "em", "s", "del", "small", "abbr", "cite", "q", "time", "ins", "u", "sup", "sub"]);
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
    if (/^<br\s*\/?>$/i.test(node.value ?? "")) { result.push({ type: "break", position: node.position }); continue; }
    const color = node.value?.match(/^<span\s+style=["'](color|background(?:-color)?):\s*(#[\da-f]{6});?["']\s*>$/i);
    const tag = node.value?.match(/^<(u|sup|sub)>$/i)?.[1]?.toLowerCase();
    const genericTag = node.value?.match(/^<([a-z]+)(?:\s[^<>]*)?>$/i)?.[1]?.toLowerCase();
    if (!color && !tag && (!genericTag || !safeInlineTags.has(genericTag))) { result.push(node); continue; }
    const tagName = tag ?? genericTag ?? "span", close = `</${tagName}>`;
    let end = i + 1, depth = 1;
    for (; end < tree.children.length; end++) {
      const other = tree.children[end];
      if (other.type !== "html") continue;
      if (other.value?.toLowerCase() === close && --depth === 0) break;
      if (new RegExp(`^<${tagName}(?:\\s[^<>]*)?>$`, "i").test(other.value ?? "")) depth++;
    }
    if (end === tree.children.length) { result.push(node); continue; }
    const type = tag ? Object.keys(tags).find(key => tags[key] === tag)! : color ? color[1] === "color" ? "deditor_color" : "deditor_background" : "deditor_html";
    const mark: SourceNode = { type, value: type === "deditor_html" ? node.value : color?.[2], children: tree.children.slice(i + 1, end), position: node.position && tree.children[end].position ? { start: node.position.start, end: tree.children[end].position!.end } : undefined };
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
export const faithfulInlineHtml = $markSchema("deditor_html", () => ({
  attrs: { opening: { default: "<span>" } },
  // Only inline presentation reaches the live DOM. Source attributes, including
  // scripts and positioning styles, remain inert in the Markdown document.
  toDOM: mark => {
    const element = document.createElement("template");
    element.innerHTML = mark.attrs.opening;
    const original = element.content.firstElementChild as HTMLElement | null;
    const tag = original?.tagName.toLowerCase() ?? "span";
    const style = ["color", "background-color", "font-weight", "font-style", "text-decoration"].map(property => {
      const value = original?.style?.getPropertyValue(property);
      return value ? `${property}:${value}` : "";
    }).filter(Boolean).join(";");
    return [safeInlineTags.has(tag) ? tag : "span", { style }, 0];
  },
  parseMarkdown: { match: node => node.type === "deditor_html", runner: (state, node, type) => {
    state.openMark(type, { opening: node.value }); state.next(node.children); state.closeMark(type);
  } },
  toMarkdown: { match: mark => mark.type.name === "deditor_html", runner: (state, mark) => { state.withMark(mark, "deditor_html", undefined, { opening: mark.attrs.opening }); } },
}));
export function configureInlineSerialization(ctx: Ctx) {
  ctx.update(remarkStringifyOptionsCtx, prev => ({ ...prev, handlers: { ...prev.handlers,
    deditor_html: (node: { opening: string }, _parent: unknown, state: { containerPhrasing: (node: unknown, info: unknown) => string }, info: unknown) => node.opening + state.containerPhrasing(node, info) + `</${node.opening.match(/^<([a-z]+)/i)?.[1] ?? "span"}>`,
    ...Object.fromEntries(kinds.map(kind => [kind, (node: { color: string }, _parent: unknown, state: { containerPhrasing: (node: unknown, info: unknown) => string }, info: unknown) => opening(kind, node.color) + state.containerPhrasing(node, info) + `</${tags[kind] ?? "span"}>`])),
  } }));
}
